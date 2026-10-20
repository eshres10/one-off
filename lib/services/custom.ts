import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import { sql, withUser, type Db } from '@/lib/db';
import { sanitizeText } from '@/lib/domain/moderation';
import { BUDGET_BANDS, CUSTOM, CUSTOM_KINDS, kindCategories } from '@/lib/custom/config';
import {
  EMPTY_BRIEF,
  FITTING_OPTIONS,
  INSPIRATION_MAX,
  MAKERS_CHOICE,
  MEASURE_FIELDS,
  OCCASIONS,
  PATTERNS,
  WORDS_MIN,
  measurementOk,
  neededBy,
  pieceTitle,
  stepReady,
  type Brief,
  type Measurements,
} from '@/lib/custom/brief';
import { loadCandidates } from '@/lib/custom/candidates';
import { matchMakers, widenOptions, type Match, type MatchBrief } from '@/lib/custom/match';
import { isOwnImageUrl } from '@/lib/storage';
import { rateLimit } from '@/lib/rate-limit';
import { reportError } from '@/lib/log';
import { UserError } from './errors';
import { notifyMakerNewRequest, notifyTeamHelp } from './custom-notify';

type Actor = Pick<SessionUser, 'id' | 'role' | 'makerId'>;

export interface Place {
  postcode: string;
  suburb: string;
  state: string;
  lat: number;
  lng: number;
}

/** "3065" → Fitzroy, VIC. The first suburb alphabetically when a postcode has several. */
export async function lookupPostcode(postcode: string): Promise<Place | null> {
  if (!/^\d{4}$/.test(postcode)) return null;
  const [p] = await sql()<Place[]>`
    select postcode, suburb, state, lat, lng from public.postcodes where postcode = ${postcode}
    order by suburb limit 1`;
  return p ?? null;
}

/** Drops anything the screens wouldn't produce; throws on what can't be sent. */
export function cleanBrief(input: Partial<Brief>): Brief {
  const b: Brief = { ...EMPTY_BRIEF, ...input };
  const str = (v: unknown, max: number) =>
    typeof v === 'string' ? sanitizeText(v).trim().slice(0, max) : '';
  const list = (v: unknown, allowed?: readonly string[]) =>
    Array.isArray(v)
      ? Array.from(
          new Set(
            v
              .filter((x): x is string => typeof x === 'string')
              .map((x) => x.trim().slice(0, 40))
              .filter((x) => x && (!allowed || allowed.includes(x))),
          ),
        )
      : [];
  const out: Brief = {
    kind: CUSTOM_KINDS.some((k) => k.value === b.kind) ? b.kind : null,
    occasion: OCCASIONS.some((o) => o.value === b.occasion) ? b.occasion : null,
    occasionOther: str(b.occasionOther, 120),
    dateChoice: ['soon', 'later', 'custom', 'flexible'].includes(b.dateChoice)
      ? b.dateChoice
      : 'later',
    customDate: /^\d{4}-\d{2}-\d{2}$/.test(b.customDate ?? '') ? b.customDate : '',
    inspiration: list(b.inspiration).filter(isOwnImageUrl).slice(0, INSPIRATION_MAX),
    link: str(b.link, 500),
    words: str(b.words, 2000),
    fabrics: list(b.fabrics).slice(0, 7),
    details: list(b.details).slice(0, 8),
    colour:
      typeof b.colour === 'string' &&
      (b.colour === MAKERS_CHOICE ||
        /^custom:#[0-9a-fA-F]{6}$/.test(b.colour) ||
        b.colour.length <= 20)
        ? b.colour
        : null,
    pattern: PATTERNS.some((p) => p.value === b.pattern) ? b.pattern : 'plain',
    fitMode: ['saved', 'measurements', 'fitting'].includes(b.fitMode ?? '') ? b.fitMode : null,
    measurements: cleanMeasurements(b.measurements),
    saveMeasurements: Boolean(b.saveMeasurements),
    budget:
      Number.isInteger(b.budget) && b.budget >= 0 && b.budget < BUDGET_BANDS.length ? b.budget : 1,
    postcode: /^\d{4}$/.test(b.postcode ?? '') ? b.postcode : '',
    suburb: str(b.suburb, 80),
    state: str(b.state, 3).toUpperCase(),
    reach: b.reach === 'near' ? 'near' : 'both',
    anonymous: b.anonymous !== false,
    sourceListingId: /^[0-9a-f-]{36}$/i.test(b.sourceListingId ?? '') ? b.sourceListingId : null,
  };
  if (out.link && !/^https?:\/\//i.test(out.link)) out.link = `https://${out.link}`;
  return out;
}

export function cleanMeasurements(m: unknown): Measurements {
  const out: Measurements = {};
  if (!m || typeof m !== 'object') return out;
  for (const f of MEASURE_FIELDS) {
    const raw = (m as Record<string, unknown>)[f.key];
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
    if (Number.isFinite(n) && measurementOk(f.key, { [f.key]: n }))
      out[f.key] = Math.round(n * 10) / 10;
  }
  return out;
}

/** Everything a brief needs before it can be matched or sent. */
export function assertComplete(b: Brief) {
  for (let step = 1; step <= 7; step++)
    if (!stepReady(step, b))
      throw new UserError(
        step === 3
          ? `Tell the makers a little more: at least ${WORDS_MIN} characters.`
          : step === 5
            ? 'Add your bust, waist and hips so makers can check the fit.'
            : step === 7
              ? 'Add your postcode so we can find makers near you.'
              : 'Finish the brief first.',
      );
}

async function placeFor(b: Brief): Promise<Place> {
  const p = await lookupPostcode(b.postcode);
  if (!p) throw new UserError('We don’t know that postcode. Check it and try again.');
  return p;
}

export function toMatchBrief(
  b: Brief,
  place: Place,
  sourceMakerId: string | null,
  today = new Date(),
): MatchBrief {
  const band = BUDGET_BANDS[b.budget]!;
  const by = neededBy(b, today);
  return {
    kind: b.kind ?? 'other',
    neededBy: by ? new Date(`${by}T00:00:00Z`) : null,
    fabrics: b.fabrics,
    details: b.details,
    budgetMin: band.min,
    budgetMax: band.max,
    fitMode: b.fitMode,
    reach: b.reach,
    lat: place.lat,
    lng: place.lng,
    sourceMakerId,
  };
}

export interface MatchView extends Match {
  /** "Collingwood, VIC · 3 km" or "Hobart, TAS · posts". */
  where: string;
}

export interface WidenView {
  kind: 'budget' | 'date' | 'reach';
  label: string;
  count: number;
  /** The brief with that one change, to run again. */
  brief: Brief;
}

export interface MatchResult {
  matches: MatchView[];
  eligibleCount: number;
  widen: WidenView[];
  /** How many makers were considered, for the finding screen. */
  checked: number;
}

async function sourceMaker(b: Brief): Promise<string | null> {
  if (!b.sourceListingId) return null;
  const [p] = await sql()<{ makerId: string }[]>`
    select maker_id from public.products where id = ${b.sourceListingId}`;
  return p?.makerId ?? null;
}

/** Runs matching for a brief and, when nothing fits, the widen suggestions. */
export async function findMatches(input: Partial<Brief>, today = new Date()): Promise<MatchResult> {
  const b = cleanBrief(input);
  assertComplete(b);
  const place = await placeFor(b);
  const candidates = await loadCandidates();
  const brief = toMatchBrief(b, place, await sourceMaker(b), today);
  const states = new Map(
    (
      await sql()<{ id: string; state: string | null }[]>`
        select id, state from public.makers where id in ${sql()(candidates.map((c) => c.makerId))}`
    ).map((r) => [r.id, r.state]),
  );
  const { matches, eligibleCount } = matchMakers(brief, candidates, today);
  const view: MatchView[] = matches.map((m) => ({
    ...m,
    where: `${[m.suburb, states.get(m.makerId)].filter(Boolean).join(', ')} · ${
      m.distanceKm != null && m.distanceKm <= 100 ? `${Math.max(1, m.distanceKm)} km` : 'posts'
    }`,
  }));
  const widen: WidenView[] =
    eligibleCount > 0
      ? []
      : widenOptions(brief, candidates, today).map((o) => {
          const next: Brief = { ...b };
          if (o.kind === 'budget') next.budget = Math.min(BUDGET_BANDS.length - 1, b.budget + 1);
          if (o.kind === 'date') {
            next.dateChoice = 'custom';
            next.customDate = o.brief.neededBy!.toISOString().slice(0, 10);
          }
          if (o.kind === 'reach') next.reach = 'both';
          return { kind: o.kind, label: o.label, count: o.count, brief: next };
        });
  return { matches: view, eligibleCount, widen, checked: candidates.length };
}

/** The columns a brief becomes. */
function rowFor(b: Brief, place: Place, today = new Date()) {
  const band = BUDGET_BANDS[b.budget]!;
  return {
    kind: b.kind ?? 'other',
    occasion: b.occasion,
    occasionOther: b.occasion === 'other' ? b.occasionOther || null : null,
    neededBy: neededBy(b, today),
    words: b.words,
    link: b.link || null,
    inspiration: b.inspiration,
    sourceListingId: b.sourceListingId,
    fabrics: b.fabrics,
    details: b.details,
    colour: b.colour,
    pattern: b.pattern,
    fitMode: b.fitMode,
    measurements: b.fitMode === 'fitting' ? null : b.measurements,
    budgetMin: band.min,
    budgetMax: band.max,
    postcode: place.postcode,
    suburb: place.suburb,
    state: place.state,
    lat: place.lat,
    lng: place.lng,
    reach: b.fitMode === 'fitting' ? 'near' : b.reach,
    anonymous: b.anonymous,
  };
}

/** Saved sizes become the brief's measurements when the buyer picks "Use my saved sizes". */
export async function savedMeasurements(buyer: Actor): Promise<Measurements> {
  const [m] = await sql()<
    { bust: string | null; waist: string | null; hips: string | null; height: string | null }[]
  >`
    select bust_cm as bust, waist_cm as waist, hips_cm as hips, height_cm as height
    from public.buyer_measurements where user_id = ${buyer.id}`;
  return cleanMeasurements(m ?? {});
}

/**
 * Saves (or refreshes) the buyer's one open draft. Returns its id; the brief is sent from it.
 */
export async function saveDraft(
  buyer: Actor,
  input: Partial<Brief>,
  today = new Date(),
): Promise<string> {
  const b = cleanBrief(input);
  const place = /^\d{4}$/.test(b.postcode) ? await lookupPostcode(b.postcode) : null;
  const r = rowFor(b, place ?? { postcode: '', suburb: '', state: '', lat: 0, lng: 0 }, today);
  return withUser(buyer, async (db) => {
    const [existing] = await db<{ id: string }[]>`
      select id from public.custom_requests where buyer_id = ${buyer.id} and status = 'draft'
      order by updated_at desc limit 1`;
    const values = {
      kind: r.kind,
      occasion: r.occasion,
      occasion_other: r.occasionOther,
      needed_by: r.neededBy,
      words: r.words || null,
      link: r.link,
      inspiration: db.json(r.inspiration as never),
      source_listing_id: r.sourceListingId,
      fabrics: r.fabrics,
      details: r.details,
      colour: r.colour,
      pattern: r.pattern,
      fit_mode: r.fitMode,
      measurements: r.measurements ? db.json(r.measurements as never) : null,
      budget_min: r.budgetMin,
      budget_max: r.budgetMax,
      postcode: place ? r.postcode : null,
      suburb: place ? r.suburb : null,
      state: place ? r.state : null,
      lat: place ? r.lat : null,
      lng: place ? r.lng : null,
      reach: r.reach,
      anonymous: r.anonymous,
      updated_at: new Date(),
    };
    if (existing) {
      await db`update public.custom_requests set ${db(values)} where id = ${existing.id}`;
      return existing.id;
    }
    const [created] = await db<{ id: string }[]>`
      insert into public.custom_requests ${db({ ...values, buyer_id: buyer.id, status: 'draft' })} returning id`;
    return created!.id;
  });
}

/**
 * Sends the brief to up to three matched makers: the request leaves draft, each maker gets a
 * recipients row with their score and reasons and 48 hours to reply, and they're told.
 */
export async function sendRequest(
  buyer: Actor,
  input: Partial<Brief>,
  makerIds: string[],
  today = new Date(),
): Promise<{ id: string; number: string }> {
  await rateLimit('customRequest', buyer.id);
  const b = cleanBrief(input);
  assertComplete(b);
  const picked = Array.from(new Set(makerIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id))));
  if (picked.length === 0) throw new UserError('Pick at least one maker to ask.');
  if (picked.length > CUSTOM.maxMakers)
    throw new UserError(`You can ask up to ${CUSTOM.maxMakers}.`);
  const place = await placeFor(b);
  const result = await findMatches(b, today);
  const byMaker = new Map(result.matches.map((m) => [m.makerId, m]));
  for (const id of picked)
    if (!byMaker.has(id))
      throw new UserError(
        'One of those makers no longer matches your brief. Find your makers again.',
      );

  const id = await saveDraft(buyer, b, today);
  const r = rowFor(b, place, today);
  const sentAt = new Date();
  const replyBy = new Date(sentAt.getTime() + CUSTOM.replyHours * 3_600_000);
  const number = await withUser(buyer, async (db) => {
    const [row] = await db<{ number: string }[]>`
      update public.custom_requests set status = 'sent', sent_at = ${sentAt}, expires_at = ${replyBy},
        postcode = ${r.postcode}, suburb = ${r.suburb}, state = ${r.state}, lat = ${r.lat}, lng = ${r.lng},
        reach = ${r.reach}, measurements = ${r.measurements ? db.json(r.measurements as never) : null}
      where id = ${id} and status = 'draft' returning number`;
    if (!row) throw new UserError('This brief has already been sent.');
    for (const makerId of picked) {
      const m = byMaker.get(makerId)!;
      await db`
        insert into public.custom_request_recipients (request_id, maker_id, match_score, match_reasons, reply_by)
        values (${id}, ${makerId}, ${m.score}, ${m.reasons}, ${replyBy})`;
    }
    if (b.fitMode === 'measurements' && b.saveMeasurements)
      await saveSizes(db, buyer.id, b.measurements);
    return row.number;
  });
  await audit('custom_request.sent', { type: 'custom_request', id }, { makers: picked }, buyer.id);
  for (const makerId of picked)
    await notifyMakerNewRequest(id, makerId).catch((err) =>
      reportError(err, { requestId: id, makerId, where: 'custom request notify' }),
    );
  return { id, number };
}

/** "Save these to my sizes": the four the account keeps. */
async function saveSizes(db: Db, userId: string, m: Measurements) {
  if (!m.bust && !m.waist && !m.hips && !m.height) return;
  await db`
    insert into public.buyer_measurements (user_id, bust_cm, waist_cm, hips_cm, height_cm)
    values (${userId}, ${m.bust ?? null}, ${m.waist ?? null}, ${m.hips ?? null}, ${m.height ?? null})
    on conflict (user_id) do update set
      bust_cm = coalesce(excluded.bust_cm, public.buyer_measurements.bust_cm),
      waist_cm = coalesce(excluded.waist_cm, public.buyer_measurements.waist_cm),
      hips_cm = coalesce(excluded.hips_cm, public.buyer_measurements.hips_cm),
      height_cm = coalesce(excluded.height_cm, public.buyer_measurements.height_cm),
      updated_at = now()`;
}

/**
 * "Ask Off One for help": the brief goes to the team instead of (or as well as) makers. Works
 * from a draft or a sent request.
 */
export async function requestHelp(
  buyer: Actor,
  input: { brief?: Partial<Brief>; requestId?: string; note: string },
  today = new Date(),
): Promise<{ id: string; number: string }> {
  await rateLimit('customRequest', buyer.id);
  const note =
    sanitizeText(input.note ?? '')
      .trim()
      .slice(0, 2000) || null;
  let id = input.requestId && /^[0-9a-f-]{36}$/i.test(input.requestId) ? input.requestId : null;
  if (!id) {
    const b = cleanBrief(input.brief ?? {});
    assertComplete(b);
    id = await saveDraft(buyer, b, today);
  }
  const help = await withUser(buyer, async (db) => {
    const [r] = await db<{ number: string; status: string }[]>`
      select number, status from public.custom_requests where id = ${id} for update`;
    if (!r) throw new UserError('We couldn’t find that brief.');
    if (r.status === 'accepted') throw new UserError('This request already has a maker.');
    await db`
      update public.custom_requests set status = 'help_requested', sent_at = coalesce(sent_at, now()) where id = ${id}`;
    const [h] = await db<{ id: string }[]>`
      insert into public.help_requests (request_id, buyer_id, note) values (${id}, ${buyer.id}, ${note}) returning id`;
    return { id: h!.id, number: r.number };
  });
  await audit('custom_request.help', { type: 'custom_request', id }, { helpId: help.id }, buyer.id);
  await notifyTeamHelp(help.id).catch((err) => reportError(err, { where: 'help request email' }));
  return { id, number: help.number };
}

export interface QuoteView {
  id: string;
  makerId: string;
  price: number;
  readyBy: string;
  fittings: string;
  fittingsLabel: string;
  fabric: string | null;
  note: string;
  sketchPath: string | null;
  status: string;
  validUntil: Date;
  editedAt: Date | null;
  createdAt: Date;
}

export interface RecipientView {
  makerId: string;
  name: string;
  slug: string;
  avatarUrl: string | null;
  suburb: string | null;
  state: string | null;
  status: string;
  replyBy: Date | null;
  quote: QuoteView | null;
}

export interface BuyerRequestView {
  id: string;
  number: string;
  status: string;
  kind: string;
  title: string;
  occasion: string | null;
  occasionOther: string | null;
  neededBy: string | null;
  words: string | null;
  inspiration: string[];
  fabrics: string[];
  details: string[];
  colour: string | null;
  pattern: string;
  budgetMin: number | null;
  budgetMax: number | null;
  suburb: string | null;
  state: string | null;
  anonymous: boolean;
  sentAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  recipients: RecipientView[];
  order: { id: string; orderNumber: string; status: string; makerId: string } | null;
  helpRequested: boolean;
}

const QUOTE_COLS = `q.id, q.maker_id, q.price, to_char(q.ready_by, 'YYYY-MM-DD') as ready_by, q.fittings, q.fabric, q.note,
  q.sketch_path, q.status, q.valid_until, q.edited_at, q.created_at`;

export const fittingsLabel = (v: string) =>
  FITTING_OPTIONS.find((f) => f.value === v)?.short ?? 'No fitting';

/** A buyer's request with who was asked and what they said, read through RLS. */
export async function getBuyerRequest(
  buyer: Actor,
  number: string,
): Promise<BuyerRequestView | null> {
  return withUser(buyer, async (db) => {
    const [r] = await db<
      (Omit<BuyerRequestView, 'recipients' | 'order' | 'helpRequested' | 'title' | 'neededBy'> & {
        neededBy: string | null;
      })[]
    >`
      select r.id, r.number, r.status, r.kind, r.occasion, r.occasion_other, to_char(r.needed_by, 'YYYY-MM-DD') as needed_by,
        r.words, r.inspiration, r.fabrics, r.details, r.colour, r.pattern, r.budget_min, r.budget_max, r.suburb, r.state,
        r.anonymous, r.sent_at, r.expires_at, r.created_at
      from public.custom_requests r where r.number = ${number} and r.buyer_id = ${buyer.id}`;
    if (!r) return null;
    const recipients = await db<(Omit<RecipientView, 'quote'> & { quote: null })[]>`
      select x.maker_id, m.display_name as name, m.slug, m.avatar_url, x.status, x.reply_by,
        coalesce((select p.suburb from public.postcodes p where p.postcode = m.studio_postcode order by p.suburb limit 1),
          nullif(trim(split_part(coalesce(m.location, ''), ',', 1)), ''), m.city) as suburb,
        m.state
      from public.custom_request_recipients x join public.makers m on m.id = x.maker_id
      where x.request_id = ${r.id} order by x.created_at`;
    const quotes = await db<(Omit<QuoteView, 'fittingsLabel'> & { makerId: string })[]>`
      select ${db.unsafe(QUOTE_COLS)} from public.custom_quotes q where q.request_id = ${r.id}`;
    const [order] = await db<
      { id: string; orderNumber: string; status: string; makerId: string }[]
    >`
      select o.id, o.order_number, o.status, q.maker_id from public.orders o join public.custom_quotes q on q.id = o.custom_quote_id
      where q.request_id = ${r.id} and o.status <> 'pending' order by o.created_at desc limit 1`;
    const [help] = await db<{ id: string }[]>`
      select id from public.help_requests where request_id = ${r.id} limit 1`;
    return {
      ...r,
      title: pieceTitle({ kind: r.kind as never, fabrics: r.fabrics }),
      recipients: recipients.map((x) => {
        const q = quotes.find((q) => q.makerId === x.makerId);
        return { ...x, quote: q ? { ...q, fittingsLabel: fittingsLabel(q.fittings) } : null };
      }),
      order: order ?? null,
      helpRequested: Boolean(help),
    };
  });
}

export interface BuyerRequestRow {
  number: string;
  status: string;
  title: string;
  neededBy: string | null;
  createdAt: Date;
  asked: number;
  quoted: number;
}

export async function listBuyerRequests(buyer: Actor): Promise<BuyerRequestRow[]> {
  const rows = await withUser(
    buyer,
    (db) => db<(Omit<BuyerRequestRow, 'title'> & { kind: string; fabrics: string[] })[]>`
    select r.number, r.status, r.kind, r.fabrics, to_char(r.needed_by, 'YYYY-MM-DD') as needed_by, r.created_at,
      (select count(*)::int from public.custom_request_recipients x where x.request_id = r.id) as asked,
      (select count(*)::int from public.custom_quotes q where q.request_id = r.id and q.status in ('sent', 'accepted')) as quoted
    from public.custom_requests r where r.buyer_id = ${buyer.id} and r.status <> 'draft'
    order by r.created_at desc limit 50`,
  );
  return rows.map((r) => ({
    ...r,
    title: pieceTitle({ kind: r.kind as never, fabrics: r.fabrics }),
  }));
}

/** The kinds a maker's categories cover, for "What you make" previews. */
export const categoriesForKind = kindCategories;
