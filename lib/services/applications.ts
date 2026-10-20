import { cached, invalidate } from '@/lib/cache';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import { sql } from '@/lib/db';
import { addBusinessDays } from '@/lib/domain/leadTime';
import { sanitizeText } from '@/lib/domain/moderation';
import { sendEmail } from '@/lib/email/send';
import { emails } from '@/lib/email/templates';
import { env } from '@/lib/env';
import { SITE } from '@/lib/site/config';
import { TERMS } from '@/lib/studio/terms';
import { EMPTY_ANSWERS, type ApplicationAnswers } from './apply';
import { logShopEvent } from './concierge';
import { UserError } from './errors';
import { nextFoundingNumber } from './founding';

type Admin = Pick<SessionUser, 'id' | 'role'>;

function assertAdmin(user: Admin) {
  if (user.role !== 'admin') throw new UserError('Admins only.');
}

/** Preset decline reasons (the admin can add a personal line). Never "outside Victoria". */
export const DECLINE_REASONS = [
  {
    value: 'not_handmade',
    label: 'Not handmade by the applicant',
    text: 'Everything on Off One is designed and made by the people selling it, and from your application we couldn’t see that your pieces are.',
  },
  {
    value: 'categories',
    label: 'Outside our categories',
    text: 'What you make sits outside the categories we focus on for now.',
  },
  {
    value: 'photos',
    label: 'Photos don’t show the work',
    text: 'The photos didn’t show us enough of your work for us to say yes.',
  },
  { value: 'other', label: 'Other', text: '' },
] as const;
export type DeclineReason = (typeof DECLINE_REASONS)[number]['value'];

const answersOf = (a: Partial<ApplicationAnswers> | null) => ({ ...EMPTY_ANSWERS, ...(a ?? {}) });
const daysSince = (d: Date | string) =>
  Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000));

export interface QueueRow {
  makerId: string;
  label: string;
  owner: string;
  place: string;
  instagram: string;
  photos: string[];
  madeBy: string;
  madeByDetail: string;
  submittedAt: Date;
  daysWaiting: number;
  overdue: boolean;
  resubmitted: boolean;
}

/** Applications waiting for a decision, oldest first. Invited shops never appear here. */
export async function applicationQueue(status: 'applied' | 'changes_requested' = 'applied') {
  const rows = await sql()<
    {
      makerId: string;
      answers: Partial<ApplicationAnswers>;
      appliedAt: Date;
      submissions: number;
    }[]
  >`
    select m.id as maker_id, coalesce(a.answers, m.application) as answers, coalesce(m.applied_at, m.created_at) as applied_at,
      (select count(*) from public.shop_applications x where x.maker_id = m.id)::int as submissions
    from public.makers m
    left join lateral (
      select answers from public.shop_applications s where s.maker_id = m.id order by submitted_at desc limit 1
    ) a on true
    where m.shop_status = ${status} and m.source = 'application'
    order by coalesce(m.applied_at, m.created_at) asc`;
  const now = new Date();
  return rows.map((r): QueueRow => {
    const a = answersOf(r.answers);
    return {
      makerId: r.makerId,
      label: a.name,
      owner: a.ownerName,
      place: [a.suburb, a.state].filter(Boolean).join(', '),
      instagram: a.instagram,
      photos: a.photos,
      madeBy: a.madeBy,
      madeByDetail: a.madeByDetail,
      submittedAt: r.appliedAt,
      daysWaiting: daysSince(r.appliedAt),
      overdue: addBusinessDays(new Date(r.appliedAt), TERMS.reviewBusinessDays) < now,
      resubmitted: r.submissions > 1,
    };
  });
}

export interface ApplicationDetail {
  makerId: string;
  slug: string;
  shopStatus: string;
  email: string | null;
  answers: ApplicationAnswers;
  appliedAt: Date | null;
  reviewNote: string | null;
  reviewedAt: Date | null;
  canReapplyAfter: Date | null;
  foundingNumber: number | null;
  internalNote: string;
  history: Array<{
    id: string;
    submittedAt: Date;
    decision: string | null;
    decidedAt: Date | null;
    decisionNote: string | null;
  }>;
}

export async function applicationDetail(makerId: string): Promise<ApplicationDetail | null> {
  const [m] = await sql()<
    (Omit<ApplicationDetail, 'answers' | 'history'> & { answers: Partial<ApplicationAnswers> })[]
  >`
    select m.id as maker_id, m.slug, m.shop_status, u.email, m.applied_at, m.review_note, m.reviewed_at, m.can_reapply_after,
      m.founding_number, coalesce(n.note, '') as internal_note,
      coalesce((select answers from public.shop_applications s where s.maker_id = m.id order by submitted_at desc limit 1),
        m.application) as answers
    from public.makers m
    left join public.users u on u.id = m.user_id
    left join public.shop_internal_notes n on n.maker_id = m.id
    where m.id = ${makerId} and m.source = 'application'`;
  if (!m) return null;
  const history = await sql()<ApplicationDetail['history']>`
    select id, submitted_at, decision, decided_at, decision_note from public.shop_applications
    where maker_id = ${makerId} order by submitted_at desc`;
  return { ...m, answers: answersOf(m.answers), history };
}

/** Founding spots: TERMS.foundingSpotsTotal, awarded by the admin (invited makers get one). */
export async function foundingSpots() {
  const [row] = await sql()<{ used: number }[]>`
    select count(*)::int as used from public.makers where founding_number is not null`;
  const used = row?.used ?? 0;
  return {
    used,
    total: TERMS.foundingSpotsTotal,
    left: Math.max(0, TERMS.foundingSpotsTotal - used),
  };
}

/**
 * The public founding offer ("Founding makers: limited spots, …"), only while spots remain;
 * otherwise null and pages show the standard terms. Cached for five minutes.
 */
export const publicFoundingOffer = cached(
  async (): Promise<string | null> => {
    const { left } = await foundingSpots();
    return left > 0
      ? `Founding makers: limited spots, ${TERMS.foundingCommissionPct}% commission for ${TERMS.foundingMonths} months.`
      : null;
  },
  ['founding-offer'],
  { revalidate: 300, tags: ['founding'] },
);

async function decide(
  makerId: string,
  admin: Admin,
  decision: 'approved' | 'changes_requested' | 'declined',
  note: string | null,
) {
  await sql()`
    update public.shop_applications set decision = ${decision}, decided_at = now(), decided_by = ${admin.id},
      decision_note = ${note}
    where id = (select id from public.shop_applications where maker_id = ${makerId} and decision is null
      order by submitted_at desc limit 1)`;
}

async function pending(makerId: string) {
  const app = await applicationDetail(makerId);
  if (!app) throw new UserError('Application not found.');
  if (app.shopStatus !== 'applied')
    throw new UserError('This application isn’t waiting for review.');
  return app;
}

/** Approve: the maker can set up payouts and list pieces. Optionally give a founding spot. */
export async function approveApplication(
  admin: Admin,
  makerId: string,
  opts: { founding: boolean },
) {
  assertAdmin(admin);
  const app = await pending(makerId);
  const foundingNumber = await sql().begin(async (tx) => {
    let n: number | null = null;
    if (opts.founding) {
      n = await nextFoundingNumber(tx);
      if (!n) throw new UserError('All founding spots are taken.');
    }
    await tx`
      update public.makers set shop_status = 'approved', reviewed_at = now(), reviewed_by = ${admin.id}, review_note = null,
        spot_checks_left = ${TERMS.spotCheckPieces}, founding_number = coalesce(${n}, founding_number)
      where id = ${makerId}`;
    return n;
  });
  await decide(makerId, admin, 'approved', null);
  if (foundingNumber) invalidate('founding');
  await logShopEvent(makerId, 'application_approved', { founding: foundingNumber });
  await audit(
    'shop.approved',
    { type: 'maker', id: makerId },
    { founding: foundingNumber },
    admin.id,
  );
  const to = app.answers.email || app.email;
  if (to)
    await sendEmail(
      emails.applicationApproved(to, { makerId, label: app.answers.name, foundingNumber }),
    );
}

/** Ask for more: the maker sees the note, edits and resubmits. */
export async function requestChanges(admin: Admin, makerId: string, note: string) {
  assertAdmin(admin);
  const text = sanitizeText(note).trim().slice(0, 1000);
  if (text.length < 5) throw new UserError('Write a note to the maker.');
  const app = await pending(makerId);
  await sql()`
    update public.makers set shop_status = 'changes_requested', reviewed_at = now(), reviewed_by = ${admin.id},
      review_note = ${text}
    where id = ${makerId}`;
  await decide(makerId, admin, 'changes_requested', text);
  await logShopEvent(makerId, 'application_changes_requested');
  await audit('shop.changes_requested', { type: 'maker', id: makerId }, {}, admin.id);
  const to = app.answers.email || app.email;
  if (to)
    await sendEmail(
      emails.applicationChanges(to, { makerId, label: app.answers.name, note: text }),
    );
}

/** Decline kindly, with a reason; they can apply again after TERMS.reapplyAfterDays. */
export async function declineApplication(
  admin: Admin,
  makerId: string,
  input: { reason: DeclineReason; personal: string },
) {
  assertAdmin(admin);
  const preset = DECLINE_REASONS.find((r) => r.value === input.reason);
  if (!preset) throw new UserError('Pick a reason.');
  const personal = sanitizeText(input.personal).trim().slice(0, 600);
  if (preset.value === 'other' && personal.length < 5)
    throw new UserError('Add a line explaining the reason.');
  const message = [preset.text, personal].filter(Boolean).join(' ');
  const app = await pending(makerId);
  const [row] = await sql()<{ after: Date }[]>`
    update public.makers set shop_status = 'declined', reviewed_at = now(), reviewed_by = ${admin.id},
      review_note = ${message}, can_reapply_after = current_date + ${TERMS.reapplyAfterDays}::int
    where id = ${makerId} returning can_reapply_after as after`;
  await decide(makerId, admin, 'declined', `${preset.label}${personal ? `: ${personal}` : ''}`);
  await logShopEvent(makerId, 'application_declined', { reason: preset.value });
  await audit('shop.declined', { type: 'maker', id: makerId }, { reason: preset.value }, admin.id);
  const to = app.answers.email || app.email;
  if (to)
    await sendEmail(
      emails.applicationDeclined(to, {
        makerId,
        label: app.answers.name,
        reason: message,
        reapplyAfter: new Date(row!.after).toLocaleDateString('en-AU', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        }),
      }),
    );
}

export async function saveInternalNote(admin: Admin, makerId: string, note: string) {
  assertAdmin(admin);
  const text = sanitizeText(note).trim().slice(0, 4000);
  await sql()`
    insert into public.shop_internal_notes (maker_id, note, updated_at, updated_by)
    values (${makerId}, ${text}, now(), ${admin.id})
    on conflict (maker_id) do update set note = excluded.note, updated_at = now(), updated_by = excluded.updated_by`;
}

export interface SpotCheck {
  productId: string;
  slug: string;
  title: string;
  shop: string;
  makerSlug: string;
  imageUrl: string | null;
  publishedAt: Date | null;
}

/** Pieces from newly approved shops waiting for a quick look (they're already published). */
export async function spotChecks(): Promise<SpotCheck[]> {
  return sql()<SpotCheck[]>`
    select p.id as product_id, p.slug, p.title, m.display_name as shop, m.slug as maker_slug, p.published_at,
      (select public_url from public.product_images i where i.product_id = p.id order by sort_order limit 1) as image_url
    from public.products p join public.makers m on m.id = p.maker_id
    where p.spot_check and p.spot_checked_at is null
    order by p.published_at nulls last`;
}

/** Looks fine: clear the flag. Or take it down with a note to the maker. */
export async function resolveSpotCheck(
  admin: Admin,
  productId: string,
  input: { unpublish: boolean; note: string },
) {
  assertAdmin(admin);
  const note = sanitizeText(input.note).trim().slice(0, 1000);
  if (input.unpublish && note.length < 5)
    throw new UserError('Tell the maker why it was taken down.');
  const [p] = await sql()<{ title: string; makerId: string; email: string | null }[]>`
    update public.products p set spot_checked_at = now(), spot_check_note = ${note || null},
      status = case when ${input.unpublish} then 'draft'::product_status else p.status end
    from public.makers m left join public.users u on u.id = m.user_id
    where p.id = ${productId} and m.id = p.maker_id
    returning p.title, p.maker_id, u.email`;
  if (!p) throw new UserError('Piece not found.');
  await audit(
    input.unpublish ? 'piece.spot_check_unpublished' : 'piece.spot_checked',
    { type: 'product', id: productId },
    { note },
    admin.id,
  );
  if (input.unpublish && p.email)
    await sendEmail(
      emails.spotCheckUnpublished(p.email, { makerId: p.makerId, title: p.title, note }),
    );
}

/**
 * The 9am summary (SITE.adminDigestHour, Melbourne): applications waiting more than
 * TERMS.reviewBusinessDays business days. Nothing is sent when none are.
 */
export async function applicationsDigest(now: Date) {
  const waiting = (await applicationQueue('applied')).filter((r) => r.overdue);
  if (!waiting.length) return { sent: false, waiting: 0 };
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: SITE.adminTimeZone }).format(now);
  const [already] = await sql()<{ n: number }[]>`
    select count(*)::int as n from public.email_outbox
    where template = 'applications_waiting'
      and (created_at at time zone ${SITE.adminTimeZone})::date = ${day}::date`;
  if (already?.n) return { sent: false, waiting: waiting.length };
  await sendEmail(
    emails.applicationsWaiting(
      env().ADMIN_NOTIFICATION_EMAIL,
      waiting.map((w) => ({ label: w.label, days: w.daysWaiting })),
    ),
  );
  return { sent: true, waiting: waiting.length };
}
