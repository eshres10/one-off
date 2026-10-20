import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import { sql } from '@/lib/db';
import { sanitizeText } from '@/lib/domain/moderation';
import { CUSTOM } from '@/lib/custom/config';
import { kindLabel, occasionLabel, pieceTitle, type Measurements } from '@/lib/custom/brief';
import { reportError } from '@/lib/log';
import { UserError } from './errors';
import { notifyMakerNewRequest } from './custom-notify';

type Admin = Pick<SessionUser, 'id' | 'role'>;

export interface HelpRequestRow {
  id: string;
  requestId: string;
  number: string;
  status: string;
  summary: string;
  buyerName: string;
  buyerEmail: string;
  note: string | null;
  assignedTo: string | null;
  assignedName: string | null;
  createdAt: Date;
}

const summaryOf = (r: {
  kind: string;
  fabrics: string[];
  occasion: string | null;
  occasionOther: string | null;
  neededBy: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  suburb: string | null;
  state: string | null;
}) =>
  [
    pieceTitle({ kind: r.kind as never, fabrics: r.fabrics }).replace(/^Custom /, ''),
    `for ${occasionLabel({ occasion: r.occasion as never, occasionOther: r.occasionOther ?? '' }) || 'an occasion'}`,
    r.neededBy ? `by ${r.neededBy}` : 'flexible',
    r.budgetMin != null ? `A$${r.budgetMin}${r.budgetMax != null ? `–${r.budgetMax}` : '+'}` : null,
    [r.suburb, r.state].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(' · ');

/** Open first, then in progress, matched, closed; newest first within each. */
export async function listHelpRequests(): Promise<HelpRequestRow[]> {
  const rows = await sql()<(Omit<HelpRequestRow, 'summary'> & Parameters<typeof summaryOf>[0])[]>`
    select h.id, h.request_id, r.number, h.status, h.note, h.assigned_to, a.display_name as assigned_name, h.created_at,
      coalesce(u.display_name, u.email) as buyer_name, u.email as buyer_email,
      r.kind, r.fabrics, r.occasion, r.occasion_other, to_char(r.needed_by, 'YYYY-MM-DD') as needed_by,
      r.budget_min, r.budget_max, r.suburb, r.state
    from public.help_requests h join public.custom_requests r on r.id = h.request_id
    join public.users u on u.id = h.buyer_id left join public.users a on a.id = h.assigned_to
    order by case h.status when 'open' then 0 when 'in_progress' then 1 when 'matched' then 2 else 3 end, h.created_at desc
    limit 200`;
  return rows.map((r) => ({ ...r, summary: summaryOf(r) }));
}

export interface HelpRequestDetail extends HelpRequestRow {
  internalNote: string | null;
  brief: {
    kindLabel: string;
    occasion: string;
    neededBy: string | null;
    words: string | null;
    link: string | null;
    inspiration: string[];
    fabrics: string[];
    details: string[];
    colour: string | null;
    pattern: string;
    fitMode: string | null;
    measurements: Measurements | null;
    budgetMin: number | null;
    budgetMax: number | null;
    postcode: string | null;
    suburb: string | null;
    state: string | null;
    reach: string;
    anonymous: boolean;
  };
  recipients: Array<{ makerId: string; name: string; status: string; replyBy: Date | null }>;
}

export async function getHelpRequest(id: string): Promise<HelpRequestDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = (await listHelpRequests()).filter((r) => r.id === id);
  if (!row) return null;
  const [h] = await sql()<
    {
      internalNote: string | null;
      words: string | null;
      link: string | null;
      inspiration: string[];
      fabrics: string[];
      details: string[];
      colour: string | null;
      pattern: string;
      fitMode: string | null;
      measurements: Measurements | null;
      budgetMin: number | null;
      budgetMax: number | null;
      postcode: string | null;
      suburb: string | null;
      state: string | null;
      reach: string;
      anonymous: boolean;
      kind: string;
      occasion: string | null;
      occasionOther: string | null;
      neededBy: string | null;
    }[]
  >`
    select h.internal_note, r.words, r.link, r.inspiration, r.fabrics, r.details, r.colour, r.pattern, r.fit_mode, r.measurements,
      r.budget_min, r.budget_max, r.postcode, r.suburb, r.state, r.reach, r.anonymous, r.kind, r.occasion, r.occasion_other,
      to_char(r.needed_by, 'YYYY-MM-DD') as needed_by
    from public.help_requests h join public.custom_requests r on r.id = h.request_id where h.id = ${id}`;
  if (!h) return null;
  const recipients = await sql()<HelpRequestDetail['recipients']>`
    select x.maker_id, m.display_name as name, x.status, x.reply_by
    from public.custom_request_recipients x join public.makers m on m.id = x.maker_id
    where x.request_id = ${row.requestId} order by x.created_at`;
  return {
    ...row,
    internalNote: h.internalNote,
    brief: {
      kindLabel: kindLabel(h.kind),
      occasion: occasionLabel({
        occasion: h.occasion as never,
        occasionOther: h.occasionOther ?? '',
      }),
      neededBy: h.neededBy,
      words: h.words,
      link: h.link,
      inspiration: h.inspiration,
      fabrics: h.fabrics,
      details: h.details,
      colour: h.colour,
      pattern: h.pattern,
      fitMode: h.fitMode,
      measurements: h.measurements,
      budgetMin: h.budgetMin,
      budgetMax: h.budgetMax,
      postcode: h.postcode,
      suburb: h.suburb,
      state: h.state,
      reach: h.reach,
      anonymous: h.anonymous,
    },
    recipients,
  };
}

export async function assignHelpRequest(admin: Admin, id: string) {
  await sql()`
    update public.help_requests set assigned_to = ${admin.id}, status = case when status = 'open' then 'in_progress' else status end
    where id = ${id}`;
  await audit('help_request.assigned', { type: 'help_request', id }, {}, admin.id);
}

/**
 * "Send to a maker": a normal recipients row, so the maker quotes from Studio like any request.
 */
export async function sendHelpRequestToMaker(
  admin: Admin,
  id: string,
  makerId: string,
  now = new Date(),
) {
  const [h] = await sql()<{ requestId: string; status: string; requestStatus: string }[]>`
    select h.request_id, h.status, r.status as request_status from public.help_requests h
    join public.custom_requests r on r.id = h.request_id where h.id = ${id}`;
  if (!h) throw new UserError('Help request not found.');
  if (h.requestStatus === 'accepted') throw new UserError('This request already has a maker.');
  const [m] = await sql()<{ id: string }[]>`
    select id from public.makers where id = ${makerId} and status = 'approved' and shop_status in ('live', 'holiday')`;
  if (!m) throw new UserError('Pick a live shop.');
  const replyBy = new Date(now.getTime() + CUSTOM.replyHours * 3_600_000);
  const [added] = await sql()<{ makerId: string }[]>`
    insert into public.custom_request_recipients (request_id, maker_id, match_reasons, reply_by)
    values (${h.requestId}, ${makerId}, ${['Picked by the Off One team']}, ${replyBy})
    on conflict (request_id, maker_id) do nothing returning maker_id`;
  if (!added) throw new UserError('That maker already has this request.');
  await sql()`
    update public.custom_requests set status = 'sent', sent_at = coalesce(sent_at, ${now}), expires_at = ${replyBy}
    where id = ${h.requestId} and status in ('help_requested', 'expired', 'draft')`;
  await sql()`update public.help_requests set status = 'matched' where id = ${id}`;
  await audit('help_request.sent_to_maker', { type: 'help_request', id }, { makerId }, admin.id);
  await notifyMakerNewRequest(h.requestId, makerId).catch((err) =>
    reportError(err, { makerId, where: 'help request to maker' }),
  );
}

export async function noteHelpRequest(admin: Admin, id: string, note: string) {
  await sql()`
    update public.help_requests set internal_note = ${sanitizeText(note).trim().slice(0, 4000) || null} where id = ${id}`;
  await audit('help_request.noted', { type: 'help_request', id }, {}, admin.id);
}

export async function closeHelpRequest(admin: Admin, id: string) {
  await sql()`update public.help_requests set status = 'closed' where id = ${id}`;
  await audit('help_request.closed', { type: 'help_request', id }, {}, admin.id);
}

export async function countOpenHelpRequests(): Promise<number> {
  const [r] = await sql()<{ n: number }[]>`
    select count(*)::int as n from public.help_requests where status in ('open', 'in_progress')`;
  return r?.n ?? 0;
}

/** Live shops, for the "Send to a maker" picker. */
export async function liveShops() {
  return sql()<{ id: string; name: string; suburb: string | null; open: boolean }[]>`
    select m.id, m.display_name as name, nullif(trim(split_part(coalesce(m.location, ''), ',', 1)), '') as suburb,
      coalesce(s.open, false) as open
    from public.makers m left join public.maker_custom_settings s on s.maker_id = m.id
    where m.status = 'approved' and m.shop_status in ('live', 'holiday') order by coalesce(s.open, false) desc, m.display_name`;
}
