import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import { sql, withUser } from '@/lib/db';
import { commissionCents } from '@/lib/domain/commission';
import { sanitizeText } from '@/lib/domain/moderation';
import { formatPrice } from '@/lib/domain/money';
import {
  BUDGET_BANDS,
  CUSTOM,
  CUSTOM_CATEGORIES,
  LEAD_TIME_CHOICES,
  RADIUS_OPTIONS,
} from '@/lib/custom/config';
import {
  FITTING_OPTIONS,
  PASS_REASONS,
  fmtDayLong,
  kindLabel,
  occasionLabel,
  pieceTitle,
  type Fitting,
  type Measurements,
} from '@/lib/custom/brief';
import { isOwnImageUrl } from '@/lib/storage';
import { rateLimit } from '@/lib/rate-limit';
import { reportError } from '@/lib/log';
import { TERMS, commissionPctAt, processingEstimateCents } from '@/lib/studio/terms';
import { UserError } from './errors';
import { notifyBuyerQuote } from './custom-notify';
import { lookupPostcode } from './custom';

type Seller = Pick<SessionUser, 'id' | 'role' | 'makerId'>;

export interface MakerRequestRow {
  id: string;
  number: string;
  /** "A buyer in Fitzroy, VIC" or "Grace M. · Ballarat, VIC". */
  who: string;
  title: string;
  kindLabel: string;
  occasion: string;
  neededBy: string | null;
  budget: string;
  recipientStatus: string;
  requestStatus: string;
  replyBy: Date | null;
  hoursLeft: number | null;
  viewed: boolean;
  thumb: string | null;
  quotePrice: number | null;
  quoteStatus: string | null;
}

const budgetLabel = (min: number | null, max: number | null) =>
  BUDGET_BANDS.find((b) => b.min === min && b.max === max)?.label ??
  (min != null ? `A$${min}${max != null ? `–${max}` : '+'}` : '—');

const hoursLeft = (replyBy: Date | null, now: Date) =>
  replyBy
    ? Math.max(0, Math.ceil((new Date(replyBy).getTime() - now.getTime()) / 3_600_000))
    : null;

function whoLabel(r: {
  anonymous: boolean;
  buyerFirstName: string | null;
  suburb: string | null;
  state: string | null;
}) {
  const place = [r.suburb, r.state].filter(Boolean).join(', ');
  return r.buyerFirstName && !r.anonymous
    ? `${r.buyerFirstName} · ${place}`
    : r.buyerFirstName
      ? `${r.buyerFirstName} · ${place}`
      : `A buyer in ${place}`;
}

/** The maker's requests: pending by reply-by first, then quoted, then closed. */
export async function listMakerRequests(
  seller: Seller,
  now = new Date(),
): Promise<MakerRequestRow[]> {
  const rows = await withUser(
    seller,
    (db) => db<
      {
        id: string;
        number: string;
        anonymous: boolean;
        buyerFirstName: string | null;
        suburb: string | null;
        state: string | null;
        kind: string;
        fabrics: string[];
        occasion: string | null;
        occasionOther: string | null;
        neededBy: string | null;
        budgetMin: number | null;
        budgetMax: number | null;
        recipientStatus: string;
        requestStatus: string;
        replyBy: Date | null;
        viewedAt: Date | null;
        inspiration: string[];
        quotePrice: number | null;
        quoteStatus: string | null;
      }[]
    >`
      select v.id, v.number, v.anonymous, v.buyer_first_name, v.suburb, v.state, v.kind, v.fabrics, v.occasion, v.occasion_other,
        to_char(v.needed_by, 'YYYY-MM-DD') as needed_by, v.budget_min, v.budget_max, v.recipient_status, v.request_status,
        v.reply_by, v.viewed_at, v.inspiration, q.price as quote_price, q.status as quote_status
      from public.maker_request_view v
      left join public.custom_quotes q on q.request_id = v.id and q.maker_id = v.maker_id
      order by case v.recipient_status when 'pending' then 0 when 'quoted' then 1 when 'chosen' then 2 else 3 end,
        v.reply_by asc nulls last, v.sent_at desc`,
  );
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    who: whoLabel(r),
    title: pieceTitle({ kind: r.kind as never, fabrics: r.fabrics }).replace(/^Custom /, ''),
    kindLabel: kindLabel(r.kind),
    occasion: occasionLabel({
      occasion: r.occasion as never,
      occasionOther: r.occasionOther ?? '',
    }),
    neededBy: r.neededBy,
    budget: budgetLabel(r.budgetMin, r.budgetMax),
    recipientStatus: r.recipientStatus,
    requestStatus: r.requestStatus,
    replyBy: r.replyBy,
    hoursLeft: r.recipientStatus === 'pending' ? hoursLeft(r.replyBy, now) : null,
    viewed: Boolean(r.viewedAt),
    thumb: r.inspiration[0] ?? null,
    quotePrice: r.quotePrice,
    quoteStatus: r.quoteStatus,
  }));
}

export async function pendingRequestCount(makerId: string): Promise<number> {
  const [r] = await sql()<{ n: number }[]>`
    select count(*)::int as n from public.custom_request_recipients x join public.custom_requests r on r.id = x.request_id
    where x.maker_id = ${makerId} and x.status = 'pending' and r.status in ('sent', 'quoted')`;
  return r?.n ?? 0;
}

export interface MakerRequestDetail extends MakerRequestRow {
  words: string | null;
  link: string | null;
  inspiration: string[];
  fabrics: string[];
  details: string[];
  colour: string | null;
  pattern: string;
  fitMode: string | null;
  measurements: Measurements | null;
  reach: string;
  anonymous: boolean;
  matchReasons: string[];
  otherMakers: number;
  sourceListing: { title: string; slug: string } | null;
  quote: {
    id: string;
    price: number;
    readyBy: string;
    fittings: string;
    fabric: string | null;
    note: string;
    sketchPath: string | null;
    status: string;
    editedAt: Date | null;
  } | null;
  passReason: string | null;
}

/** One request, through the view (never the buyer's postcode or exact location). Marks it seen. */
export async function getMakerRequest(
  seller: Seller,
  id: string,
  now = new Date(),
): Promise<MakerRequestDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await listMakerRequests(seller, now).then((rows) =>
    rows.filter((r) => r.id === id),
  );
  if (!row) return null;
  const [v] = await withUser(
    seller,
    (db) => db<
      {
        words: string | null;
        link: string | null;
        inspiration: string[];
        fabrics: string[];
        details: string[];
        colour: string | null;
        pattern: string;
        fitMode: string | null;
        measurements: Measurements | null;
        reach: string;
        anonymous: boolean;
        matchReasons: string[];
        otherMakers: number;
        passReason: string | null;
        sourceListingId: string | null;
      }[]
    >`
      select words, link, inspiration, fabrics, details, colour, pattern, fit_mode, measurements, reach, anonymous,
        match_reasons, other_makers, pass_reason, source_listing_id
      from public.maker_request_view where id = ${id}`,
  );
  if (!v) return null;
  const [quote] = await withUser(
    seller,
    (db) => db<NonNullable<MakerRequestDetail['quote']>[]>`
      select id, price, to_char(ready_by, 'YYYY-MM-DD') as ready_by, fittings, fabric, note, sketch_path, status, edited_at
      from public.custom_quotes where request_id = ${id} and maker_id = ${seller.makerId!}`,
  );
  const [source] = v.sourceListingId
    ? await sql()<{ title: string; slug: string }[]>`
        select title, slug from public.products where id = ${v.sourceListingId}`
    : [];
  await sql()`
    update public.custom_request_recipients set viewed_at = coalesce(viewed_at, ${now})
    where request_id = ${id} and maker_id = ${seller.makerId!}`;
  return { ...row, ...v, sourceListing: source ?? null, quote: quote ?? null };
}

export interface QuoteInput {
  requestId: string;
  /** A$ whole dollars, as typed. */
  priceDollars: number;
  readyBy: string;
  fittings: string;
  fabric: string;
  note: string;
  sketchPath: string | null;
  canMakeToMeasurements: boolean;
}

/** "You get about A$549.90": the price less the shop's commission and the card fee estimate. */
export function youGetCents(priceCents: number, commissionPct: number): number {
  const bps = Math.round(commissionPct * 100);
  return priceCents - commissionCents(priceCents, bps) - processingEstimateCents(priceCents);
}

/**
 * Sends (or edits) the maker's quote. A picked maker only (RLS), measurements checked, a note of
 * at least 20 characters, a date they can make. Editing is allowed until the buyer accepts; the
 * buyer sees "Updated".
 */
export async function sendQuote(seller: Seller, input: QuoteInput, now = new Date()) {
  await rateLimit('customQuote', seller.id);
  const price = Math.round(Number(input.priceDollars) * 100);
  if (!Number.isFinite(price) || price < 5000)
    throw new UserError('Enter a price of at least A$50.');
  if (price > 2_000_000) throw new UserError('That’s above the maximum quote.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.readyBy))
    throw new UserError('Pick the date it’ll be ready.');
  const ready = new Date(`${input.readyBy}T00:00:00Z`);
  if (ready.getTime() < now.getTime() - 86_400_000)
    throw new UserError('Ready-by needs to be a date to come.');
  if (!FITTING_OPTIONS.some((f) => f.value === input.fittings))
    throw new UserError('Choose the fittings.');
  const note = sanitizeText(input.note ?? '').trim();
  if (note.length < 20) throw new UserError('Write them a note of at least 20 characters.');
  if (note.length > 2000) throw new UserError('Keep the note under 2000 characters.');
  if (!input.canMakeToMeasurements)
    throw new UserError('Tick that you’ve checked their measurements and can make it to fit.');
  const fabric =
    sanitizeText(input.fabric ?? '')
      .trim()
      .slice(0, 200) || null;
  const sketch = input.sketchPath && isOwnImageUrl(input.sketchPath) ? input.sketchPath : null;
  const fittings = input.fittings as Fitting;

  const settings = await getCustomSettings(seller);
  if (!settings.fittingsInPerson && (fittings === 'studio_one' || fittings === 'studio_two'))
    throw new UserError('Turn on in-person fittings in your custom work settings first.');

  const result = await withUser(seller, async (db) => {
    const [x] = await db<{ status: string; requestStatus: string }[]>`
      select x.status, r.request_status from public.custom_request_recipients x
      join public.maker_request_view r on r.id = x.request_id
      where x.request_id = ${input.requestId} and x.maker_id = ${seller.makerId!} for update of x`;
    if (!x) throw new UserError('This request wasn’t sent to you.');
    if (x.status === 'expired') throw new UserError('The 48 hours to reply have passed.');
    if (x.status === 'not_chosen') throw new UserError('The buyer chose another maker.');
    if (x.status === 'chosen' || x.requestStatus === 'accepted')
      throw new UserError('They’ve already accepted your quote.');
    if (!['sent', 'quoted'].includes(x.requestStatus))
      throw new UserError('This request is closed.');
    const [existing] = await db<{ id: string; status: string }[]>`
      select id, status from public.custom_quotes where request_id = ${input.requestId} and maker_id = ${seller.makerId!}`;
    if (existing?.status === 'accepted')
      throw new UserError('They’ve already accepted your quote.');
    if (existing) {
      await db`
        update public.custom_quotes set price = ${price}, ready_by = ${input.readyBy}, fittings = ${fittings}, fabric = ${fabric},
          note = ${note}, sketch_path = ${sketch}, can_make_to_measurements = true, status = 'sent',
          valid_until = ${new Date(now.getTime() + CUSTOM.quoteValidDays * 86_400_000)}, edited_at = ${now}
        where id = ${existing.id}`;
    } else {
      await db`
        insert into public.custom_quotes (request_id, maker_id, price, ready_by, fittings, fabric, note, sketch_path,
          can_make_to_measurements, valid_until)
        values (${input.requestId}, ${seller.makerId!}, ${price}, ${input.readyBy}, ${fittings}, ${fabric}, ${note}, ${sketch},
          true, ${new Date(now.getTime() + CUSTOM.quoteValidDays * 86_400_000)})`;
    }
    await db`
      update public.custom_request_recipients set status = 'quoted', pass_reason = null
      where request_id = ${input.requestId} and maker_id = ${seller.makerId!}`;
    return { updated: Boolean(existing) };
  });
  // The request itself belongs to the buyer: the status flip runs as the service.
  await sql()`update public.custom_requests set status = 'quoted' where id = ${input.requestId} and status = 'sent'`;
  await audit(
    'custom_quote.sent',
    { type: 'custom_request', id: input.requestId },
    { price, updated: result.updated },
    seller.id,
  );
  await notifyBuyerQuote(input.requestId, seller.makerId!, result.updated).catch((err) =>
    reportError(err, { requestId: input.requestId, where: 'quote notify' }),
  );
  return { price, updated: result.updated };
}

/** Pass on a request. The buyer sees "Not available this time"; the reason is kept for matching. */
export async function passRequest(seller: Seller, requestId: string, reason: string) {
  if (!PASS_REASONS.some((r) => r.value === reason)) throw new UserError('Choose a reason.');
  await withUser(seller, async (db) => {
    const [x] = await db<{ status: string }[]>`
      select status from public.custom_request_recipients
      where request_id = ${requestId} and maker_id = ${seller.makerId!} for update`;
    if (!x) throw new UserError('This request wasn’t sent to you.');
    if (x.status === 'chosen') throw new UserError('They’ve already accepted your quote.');
    await db`
      update public.custom_request_recipients set status = 'passed', pass_reason = ${reason}
      where request_id = ${requestId} and maker_id = ${seller.makerId!}`;
    await db`
      update public.custom_quotes set status = 'withdrawn'
      where request_id = ${requestId} and maker_id = ${seller.makerId!} and status = 'sent'`;
  });
  await audit(
    'custom_request.passed',
    { type: 'custom_request', id: requestId },
    { reason },
    seller.id,
  );
}

export interface CustomSettings {
  open: boolean;
  spotsPerMonth: number;
  spotsUsed: number;
  categories: string[];
  fabrics: string[];
  minPrice: number;
  leadTime: string;
  fittingsInPerson: boolean;
  fittingRadiusKm: number | null;
  postsAustraliaWide: boolean;
  studioPostcode: string;
  studioSuburb: string | null;
  studioState: string | null;
  /** For the preview card. */
  shop: {
    name: string;
    avatarUrl: string | null;
    coverUrl: string | null;
    rating: number;
    reviewCount: number;
    replyHours: number;
  };
  commissionPct: number;
}

const leadLabel = (lower: number, upper: number) =>
  LEAD_TIME_CHOICES.find((c) => c.lower === lower)?.label ?? `${lower}–${upper} weeks`;

export async function getCustomSettings(seller: Seller, now = new Date()): Promise<CustomSettings> {
  const [m] = await sql()<
    {
      displayName: string;
      avatarUrl: string | null;
      coverUrl: string | null;
      rating: string;
      reviewCount: number;
      replyHours: number;
      foundingUntil: Date | null;
      studioPostcode: string | null;
      open: boolean | null;
      spotsPerMonth: number | null;
      categories: string[] | null;
      fabrics: string[] | null;
      minPrice: number | null;
      leadLower: number | null;
      leadUpper: number | null;
      fittingsInPerson: boolean | null;
      fittingRadiusKm: number | null;
      postsAustraliaWide: boolean | null;
      spotsUsed: number;
    }[]
  >`
    select m.display_name, m.avatar_url, m.cover_url, m.rating, m.review_count, m.response_time_hours as reply_hours,
      m.founding_until, m.studio_postcode, s.open, s.spots_per_month, s.categories, s.fabrics, s.min_price,
      lower(s.lead_time_weeks) as lead_lower, upper(s.lead_time_weeks) as lead_upper, s.fittings_in_person,
      s.fitting_radius_km, s.posts_australia_wide,
      (select count(distinct oi.custom_quote_id)::int from public.order_items oi join public.orders o on o.id = oi.order_id
        where oi.maker_id = m.id and oi.custom_quote_id is not null and o.status not in ('failed', 'cancelled', 'refunded')
          and o.created_at >= date_trunc('month', ${now}::timestamptz at time zone 'Australia/Melbourne') at time zone 'Australia/Melbourne') as spots_used
    from public.makers m left join public.maker_custom_settings s on s.maker_id = m.id where m.id = ${seller.makerId!}`;
  if (!m) throw new UserError('Shop not found.');
  const place = m.studioPostcode ? await lookupPostcode(m.studioPostcode) : null;
  return {
    open: m.open ?? false,
    spotsPerMonth: m.spotsPerMonth ?? 4,
    spotsUsed: m.spotsUsed,
    categories: m.categories ?? [],
    fabrics: m.fabrics ?? [],
    minPrice: m.minPrice ?? 0,
    leadTime: leadLabel(m.leadLower ?? 2, (m.leadUpper ?? 5) - 1),
    fittingsInPerson: m.fittingsInPerson ?? false,
    fittingRadiusKm: m.fittingRadiusKm ?? null,
    postsAustraliaWide: m.postsAustraliaWide ?? true,
    studioPostcode: m.studioPostcode ?? '',
    studioSuburb: place?.suburb ?? null,
    studioState: place?.state ?? null,
    shop: {
      name: m.displayName,
      avatarUrl: m.avatarUrl,
      coverUrl: m.coverUrl,
      rating: Number(m.rating),
      reviewCount: m.reviewCount,
      replyHours: m.replyHours,
    },
    commissionPct: commissionPctAt(m.foundingUntil, now),
  };
}

export interface CustomSettingsInput {
  open: boolean;
  spotsPerMonth: number;
  categories: string[];
  fabrics: string[];
  minPrice: number;
  leadTime: string;
  fittingsInPerson: boolean;
  fittingRadiusKm: number | null;
  postsAustraliaWide: boolean;
  studioPostcode: string;
}

export async function saveCustomSettings(seller: Seller, input: CustomSettingsInput) {
  const spots = Math.max(0, Math.min(50, Math.round(Number(input.spotsPerMonth) || 0)));
  const categories = input.categories.filter((c) =>
    (CUSTOM_CATEGORIES as readonly string[]).includes(c),
  );
  const fabrics = Array.from(
    new Set(input.fabrics.map((f) => sanitizeText(f).trim().slice(0, 30)).filter(Boolean)),
  ).slice(0, 12);
  const minPrice = Math.max(0, Math.min(100_000, Math.round(Number(input.minPrice) || 0)));
  const lead = LEAD_TIME_CHOICES.find((c) => c.label === input.leadTime) ?? LEAD_TIME_CHOICES[1];
  const radius = RADIUS_OPTIONS.some((r) => r.value === input.fittingRadiusKm)
    ? input.fittingRadiusKm
    : null;
  const postcode = String(input.studioPostcode ?? '').trim();
  if (input.open && categories.length === 0)
    throw new UserError('Pick at least one thing you make.');
  if (input.open && !/^\d{4}$/.test(postcode))
    throw new UserError('Add your studio postcode so buyers near you can find you.');
  const place = /^\d{4}$/.test(postcode) ? await lookupPostcode(postcode) : null;
  if (postcode && !place)
    throw new UserError('We don’t know that postcode. Check it and try again.');
  if (input.open && !input.postsAustraliaWide && !input.fittingsInPerson)
    throw new UserError(
      'Either post Australia-wide or offer in-person fittings, so someone can reach you.',
    );
  await sql().begin(async (tx) => {
    await tx`
      insert into public.maker_custom_settings (maker_id, open, spots_per_month, categories, fabrics, min_price, lead_time_weeks,
        fittings_in_person, fitting_radius_km, posts_australia_wide, updated_at)
      values (${seller.makerId!}, ${input.open}, ${spots}, ${categories}, ${fabrics}, ${minPrice},
        ${`[${lead.lower},${lead.upper + 1})`}::int4range, ${input.fittingsInPerson}, ${radius}, ${input.postsAustraliaWide}, now())
      on conflict (maker_id) do update set open = excluded.open, spots_per_month = excluded.spots_per_month,
        categories = excluded.categories, fabrics = excluded.fabrics, min_price = excluded.min_price,
        lead_time_weeks = excluded.lead_time_weeks, fittings_in_person = excluded.fittings_in_person,
        fitting_radius_km = excluded.fitting_radius_km, posts_australia_wide = excluded.posts_australia_wide, updated_at = now()`;
    await tx`
      update public.makers set studio_postcode = ${place?.postcode ?? null}, studio_lat = ${place?.lat ?? null},
        studio_lng = ${place?.lng ?? null}, custom_commissions_enabled = ${input.open}
      where id = ${seller.makerId!}`;
  });
  await audit(
    'custom_settings.saved',
    { type: 'maker', id: seller.makerId! },
    { open: input.open, spots },
    seller.id,
  );
}

/** The lines on the quote panel and settings page that explain the money. */
export const payoutLines = (commissionPct: number) => ({
  commission:
    commissionPct === TERMS.foundingCommissionPct
      ? `Founding maker: ${TERMS.foundingCommissionPct}% commission on custom work for now, ${TERMS.standardCommissionPct}% after.`
      : `${commissionPct}% commission on custom work, like any sale.`,
  advance: `${CUSTOM.advancePct}% of the piece price comes to you when you mark the fabric bought. The rest ${TERMS.releaseDaysAfterDelivery} days after delivery.`,
  example: (price: number) =>
    `On ${formatPrice(price)}: about ${formatPrice(youGetCents(price, commissionPct))} after commission and card fees.`,
});

export { fmtDayLong };
