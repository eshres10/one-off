import { z } from 'zod';
import { audit } from '@/lib/audit';
import { sql, withUser } from '@/lib/db';
import { env } from '@/lib/env';
import { BRAND } from '@/lib/brand';
import { emails } from '@/lib/email/templates';
import { sendEmail } from '@/lib/email/send';
import { sanitizeText } from '@/lib/domain/moderation';
import type { SessionUser } from '@/lib/auth/session';
import {
  CLAIM_REASONS,
  PHOTO_REQUIRED_REASONS,
  REQUESTED_OUTCOMES,
  RETURNS,
  isCustomType,
  type ClaimReason,
} from '@/lib/content/returns';
import { SITE } from '@/lib/site/config';
import {
  CLAIM_STATUS_LABEL,
  PROPOSAL_LABEL,
  canReportProblem,
  addBusinessDays,
  claimRespondBy,
  isClaimActive,
  resolutionStatus,
  type ClaimProposal,
  type ClaimResolution,
  type ClaimStatus,
} from '@/lib/domain/claims';
import { verifyClaimPhotos } from '@/lib/claim-photos';
import { refundOrderItem } from './webhook';
import { openOrderThread } from './messaging';
import { reportError } from '@/lib/log';
import { UserError } from './errors';

type Actor = Pick<SessionUser, 'id' | 'role' | 'makerId'>;

const fmtDay = (d: Date) =>
  d.toLocaleString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Australia/Sydney',
  });

const reasonLabel = (r: ClaimReason) => CLAIM_REASONS.find((x) => x.value === r)?.label ?? r;

export const claimInputSchema = z
  .object({
    orderItemId: z.string().uuid(),
    reason: z.enum(CLAIM_REASONS.map((r) => r.value) as [ClaimReason, ...ClaimReason[]], {
      errorMap: () => ({ message: 'Choose what’s wrong' }),
    }),
    details: z
      .string()
      .trim()
      .min(20, 'Tell us a little more (at least 20 characters)')
      .max(1000, 'Keep it under 1,000 characters'),
    photos: z.array(z.string()).max(6, 'Add up to 6 photos'),
    outcome: z.enum(['repair', 'replace', 'refund'], {
      errorMap: () => ({ message: 'Choose what would make it right' }),
    }),
  })
  .refine((v) => !PHOTO_REQUIRED_REASONS.includes(v.reason) || v.photos.length > 0, {
    path: ['photos'],
    message: 'Add at least one photo',
  });
export type ClaimInput = z.infer<typeof claimInputSchema>;

export interface ReportableItem {
  id: string;
  orderId: string;
  orderNumber: string;
  makerId: string;
  makerName: string;
  productTitle: string;
  productType: string;
  variantLabel: string;
  imageUrl: string | null;
  deliveredAt: Date | null;
  fulfilmentId: string;
}

/** The buyer's own order item, read through RLS. */
export async function getReportableItem(buyer: Actor, orderItemId: string) {
  const [item] = await withUser(
    buyer,
    (db) => db<ReportableItem[]>`
    select oi.id, oi.order_id, o.order_number, oi.maker_id, m.display_name as maker_name, oi.product_title,
           oi.product_type, oi.variant_label, oi.image_url, coalesce(oi.delivered_at, f.delivered_at) as delivered_at, oi.fulfilment_id
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    join public.fulfilments f on f.id = oi.fulfilment_id
    join public.makers m on m.id = oi.maker_id
    where oi.id = ${orderItemId} and o.buyer_user_id = ${buyer.id}`,
  );
  return item ?? null;
}

/** Buyer files a fault claim for a delivered item, within the report window. */
export async function createClaim(buyer: Actor, input: ClaimInput, now = new Date()) {
  const item = await getReportableItem(buyer, input.orderItemId);
  if (!item) throw new UserError('We couldn’t find that piece in your orders.');
  if (!canReportProblem(item.deliveredAt, now))
    throw new UserError(
      `Problems can be reported here for ${RETURNS.reportWindowDays} days after delivery. Please contact us at ${BRAND.supportEmail} and we’ll help.`,
    );
  if (input.reason === 'custom_fit' && !isCustomType(item.productType))
    throw new UserError('Choose another reason — this piece wasn’t made to your measurements.');
  await verifyClaimPhotos(buyer.id, input.photos);

  const respondBy = claimRespondBy(now);
  const platformDue = addBusinessDays(respondBy, SITE.cases.platformDecisionBusinessDays);
  // [DECIDE] Reported soon after delivery: the maker's payout for this parcel waits for the case.
  const pause =
    !!item.deliveredAt &&
    now.getTime() - new Date(item.deliveredAt).getTime() <=
      SITE.cases.pausePayoutIfReportedWithinDays * 86_400_000;
  const [numbered] = await sql()<{ caseNumber: string }[]>`
    select public.next_case_number() as case_number`;
  const caseNumber = numbered!.caseNumber;
  let claimId: string;
  try {
    claimId = await withUser(buyer, async (db) => {
      const [row] = await db<{ id: string }[]>`
        insert into public.return_claims (order_id, order_item_id, buyer_id, seller_id, reason, details, photos, respond_by,
          created_at, case_number, requested_outcome, fulfilment_id, platform_due_at)
        values (${item.orderId}, ${item.id}, ${buyer.id}, ${item.makerId}, ${input.reason}::claim_reason,
                ${sanitizeText(input.details)}, ${input.photos}, ${respondBy}, ${now}, ${caseNumber},
                ${input.outcome}, ${item.fulfilmentId}, ${platformDue})
        returning id`;
      return row!.id;
    });
  } catch (err) {
    if ((err as { code?: string }).code === '23505')
      throw new UserError('You’ve already reported a problem with this piece. We’re on it.');
    throw err;
  }

  // The order is now an issue; reported early, the maker's payout for it is paused too.
  await sql()`
    update public.fulfilments set status = 'issue'
    where id = ${item.fulfilmentId} and status in ('shipped', 'delivered')`;
  if (pause) {
    const paused = await sql()`
      update public.fulfilments set payout_status = 'paused'
      where id = ${item.fulfilmentId} and stripe_transfer_id is null and payout_status in ('held', 'scheduled')
      returning id`;
    if (paused.length)
      await sql()`update public.return_claims set paused_payout = true where id = ${claimId}`;
  }
  await postCaseToThread(claimId, buyer, item, input);

  const [contacts] = await sql()<{ buyerEmail: string; makerEmail: string }[]>`
    select o.buyer_email, u.email as maker_email
    from public.orders o, public.makers m join public.users u on u.id = m.user_id
    where o.id = ${item.orderId} and m.id = ${item.makerId}`;
  const due = fmtDay(respondBy);
  const reason = reasonLabel(input.reason);
  if (contacts) {
    await sendEmail(
      emails.claimReceivedBuyer(contacts.buyerEmail, {
        id: claimId,
        productTitle: item.productTitle,
        makerName: item.makerName,
        respondBy: due,
        caseNumber,
      }),
    );
    await sendEmail(
      emails.claimNewSeller(contacts.makerEmail, {
        id: claimId,
        productTitle: item.productTitle,
        orderNumber: item.orderNumber,
        reason,
        respondBy: due,
        caseNumber,
        outcome: REQUESTED_OUTCOMES.find((o) => o.value === input.outcome)?.label,
      }),
    );
  }
  await sendEmail(
    emails.claimNewSupport(env().ADMIN_NOTIFICATION_EMAIL, {
      id: claimId,
      productTitle: item.productTitle,
      orderNumber: item.orderNumber,
      reason,
      makerName: item.makerName,
    }),
  );
  await audit(
    'claim.created',
    { type: 'return_claim', id: claimId },
    { reason: input.reason },
    buyer.id,
  );
  return { claimId, caseNumber };
}

/**
 * The report as a system message in the buyer–maker conversation about the piece, with the
 * photos (served through the access-checked claim photo route).
 */
async function postCaseToThread(
  claimId: string,
  buyer: Actor,
  item: ReportableItem,
  input: ClaimInput,
) {
  try {
    const threadId = await openOrderThread(buyer, item.fulfilmentId);
    const [c] = await sql()<{ caseNumber: string }[]>`
      select case_number from public.return_claims where id = ${claimId}`;
    const outcome = REQUESTED_OUTCOMES.find((o) => o.value === input.outcome)?.label ?? '';
    const body = [
      `Problem reported · ${c?.caseNumber ?? ''}`,
      `${item.productTitle}: ${reasonLabel(input.reason)}`,
      `“${sanitizeText(input.details).slice(0, 1000)}”`,
      `Asked for: ${outcome}`,
    ].join('\n');
    const photos = input.photos.map((_, i) => `/api/claims/${claimId}/photos/${i}`);
    await sql()`
      insert into public.messages (thread_id, sender_user_id, body, kind, image_urls)
      values (${threadId}, ${buyer.id}, ${body}, 'system', ${photos})`;
    await sql()`
      update public.message_threads set last_message_at = now(), maker_unread = maker_unread + 1,
        maker_needs_reply = true
      where id = ${threadId}`;
  } catch (err) {
    reportError(err, { where: 'postCaseToThread', claimId });
  }
}

export interface ClaimView {
  id: string;
  orderId: string;
  orderNumber: string;
  orderItemId: string;
  productTitle: string;
  productType: string;
  variantLabel: string;
  imageUrl: string | null;
  lineTotalCents: number;
  refundedCents: number;
  makerName: string;
  sellerId: string;
  reason: ClaimReason;
  details: string;
  photos: string[];
  status: ClaimStatus;
  proposal: ClaimProposal | null;
  sellerResponse: string | null;
  resolutionNote: string | null;
  refundCents: number | null;
  respondBy: Date;
  createdAt: Date;
  sellerRespondedAt: Date | null;
  resolvedAt: Date | null;
  escalatedAt: Date | null;
  buyerName: string | null;
  agreedSpec: Record<string, unknown> | null;
  caseNumber: string | null;
  requestedOutcome: 'repair' | 'replace' | 'refund' | null;
  pausedPayout: boolean;
  platformDueAt: Date | null;
}

const CLAIM_COLUMNS = (db: ReturnType<typeof sql>) => db`
  c.id, c.order_id, o.order_number, c.order_item_id, oi.product_title, oi.product_type, oi.variant_label, oi.image_url,
  oi.line_total_cents, oi.refunded_cents, m.display_name as maker_name, c.seller_id, c.reason, c.details, c.photos,
  c.status, c.proposal, c.seller_response, c.resolution_note, c.refund_cents, c.respond_by, c.created_at,
  c.seller_responded_at, c.resolved_at, c.escalated_at, public.user_first_name(c.buyer_id) as buyer_name, o.agreed_spec,
  c.case_number, c.requested_outcome, c.paused_payout, c.platform_due_at`;

const CLAIM_FROM = (db: ReturnType<typeof sql>) => db`
  from public.return_claims c
  join public.order_summaries o on o.id = c.order_id
  join public.order_items oi on oi.id = c.order_item_id
  join public.makers m on m.id = c.seller_id`;

/** A claim the user can see: their own (buyer), on their items (maker), or any (admin). RLS decides. */
export async function getClaim(user: Actor, claimId: string): Promise<ClaimView | null> {
  if (!z.string().uuid().safeParse(claimId).success) return null;
  const [claim] = await withUser(
    user,
    (db) => db<ClaimView[]>`select ${CLAIM_COLUMNS(db)} ${CLAIM_FROM(db)} where c.id = ${claimId}`,
  );
  return claim ?? null;
}

export async function listClaims(
  user: Actor,
  scope: 'buyer' | 'seller' | 'admin',
  opts: { status?: ClaimStatus[]; orderIds?: string[] } = {},
): Promise<ClaimView[]> {
  return withUser(
    user,
    (db) => db<ClaimView[]>`
    select ${CLAIM_COLUMNS(db)} ${CLAIM_FROM(db)}
    where true
      ${scope === 'buyer' ? db`and c.buyer_id = ${user.id}` : db``}
      ${scope === 'seller' ? db`and c.seller_id = ${user.makerId ?? null}` : db``}
      ${opts.status?.length ? db`and c.status in ${db(opts.status)}` : db``}
      ${opts.orderIds?.length ? db`and c.order_id in ${db(opts.orderIds)}` : db``}
    order by (c.status = 'escalated') desc, (c.status = 'open') desc, c.respond_by asc, c.created_at desc
    limit 200`,
  );
}

/** The maker replies to a claim on one of their items and proposes a remedy. */
export async function respondToClaim(
  seller: Actor,
  claimId: string,
  input: { proposal: ClaimProposal; message: string },
) {
  const claim = await getClaim(seller, claimId);
  if (!claim || claim.sellerId !== seller.makerId) throw new UserError('Claim not found.');
  if (!['open', 'escalated', 'seller_responded'].includes(claim.status))
    throw new UserError('This claim is already resolved.');
  if (input.proposal === 'alteration' && !isCustomType(claim.productType))
    throw new UserError(
      'Alterations are for custom pieces. Propose a repair, replacement or refund.',
    );
  const message = sanitizeText(input.message);
  if (message.length < 10) throw new UserError('Add a short message for the buyer.');
  await sql()`
    update public.return_claims set proposal = ${input.proposal}, seller_response = ${message},
      seller_responded_at = coalesce(seller_responded_at, now()),
      status = case when status = 'escalated' then status else 'seller_responded'::claim_status end
    where id = ${claimId}`;
  const [buyer] = await sql()<{ email: string }[]>`
    select o.buyer_email as email from public.orders o where o.id = ${claim.orderId}`;
  if (buyer)
    await sendEmail(
      emails.claimSellerResponded(buyer.email, {
        id: claimId,
        productTitle: claim.productTitle,
        makerName: claim.makerName,
        proposal: PROPOSAL_LABEL[input.proposal].toLowerCase(),
      }),
    );
  await audit(
    'claim.responded',
    { type: 'return_claim', id: claimId },
    { proposal: input.proposal },
    seller.id,
  );
}

/**
 * Closes a claim. Makers can resolve their own claims with a repair, replacement or refund;
 * only One Off (admin) can reject one. Refunds go through Stripe and reverse the maker's
 * transfer for that item, so the money comes back out of the maker's balance.
 */
export async function resolveClaim(
  actor: Actor,
  claimId: string,
  input: {
    resolution: ClaimResolution;
    note?: string;
    refundCents?: number | null;
    /** Admin only, never shown to the buyer or maker. */
    internalNote?: string;
  },
) {
  const claim = await getClaim(actor, claimId);
  const isAdmin = actor.role === 'admin';
  if (!claim || (!isAdmin && claim.sellerId !== actor.makerId))
    throw new UserError('Claim not found.');
  if (!isClaimActive(claim.status)) throw new UserError('This claim is already resolved.');
  if (input.resolution === 'reject' && !isAdmin)
    throw new UserError('Only One Off can close a claim without a remedy. Propose a fix instead.');
  const note = input.note ? sanitizeText(input.note) : null;
  if (input.resolution === 'reject' && (!note || note.length < 10))
    throw new UserError('Explain to the buyer why the claim is being closed.');

  let refundCents: number | null = null;
  if (input.resolution === 'refund') {
    const remaining = claim.lineTotalCents - claim.refundedCents;
    const amount = input.refundCents ?? remaining;
    if (amount <= 0 || amount > remaining)
      throw new UserError(`Refund must be between A$0.01 and A$${(remaining / 100).toFixed(2)}.`);
    const res = await refundOrderItem({
      orderItemId: claim.orderItemId,
      amountCents: amount,
      reason: `claim:${claimId}`,
      actorUserId: actor.id,
      claimId,
    });
    refundCents = res.amountCents;
  }

  const status = resolutionStatus(input.resolution);
  await sql()`
    update public.return_claims set status = ${status}::claim_status, resolution_note = ${note},
      refund_cents = ${refundCents}, resolved_at = now()
    where id = ${claimId}`;
  // Back to delivered (the release job pays whatever is still owed), or refunded in full.
  await sql()`
    update public.fulfilments f set status = case
        when not exists (select 1 from public.order_items oi where oi.fulfilment_id = f.id and oi.fulfilment_status <> 'refunded')
        then 'refunded'::fulfilment_status else 'delivered'::fulfilment_status end
    where f.id = (select fulfilment_id from public.order_items where id = ${claim.orderItemId}) and f.status = 'issue'
      and not exists (select 1 from public.return_claims c join public.order_items oi on oi.id = c.order_item_id
        where oi.fulfilment_id = f.id and c.status in ('open', 'seller_responded', 'escalated'))`;
  // A payout paused for this case goes back on schedule once nothing else holds it.
  await sql()`
    update public.fulfilments f set payout_status = 'scheduled'
    where f.id = (select fulfilment_id from public.order_items where id = ${claim.orderItemId})
      and f.payout_status = 'paused'
      and not exists (select 1 from public.return_claims c
        where c.fulfilment_id = f.id and c.paused_payout and c.status in ('open', 'seller_responded', 'escalated'))`;
  if (input.internalNote && isAdmin) await addCaseNote(actor, claimId, input.internalNote);
  const [buyer] = await sql()<{ email: string }[]>`
    select o.buyer_email as email from public.orders o where o.id = ${claim.orderId}`;
  if (buyer)
    await sendEmail(
      emails.claimResolvedBuyer(buyer.email, {
        id: claimId,
        productTitle: claim.productTitle,
        outcome: CLAIM_STATUS_LABEL[status].replace(/^Resolved — /, '').toLowerCase(),
        note,
      }),
    );
  await audit(
    'claim.resolved',
    { type: 'return_claim', id: claimId },
    { status, refundCents },
    actor.id,
  );
}

/**
 * Escalates open claims whose maker hasn't responded by the deadline. Runs from the daily cron
 * and whenever the admin or seller claim lists load, so nothing waits on the schedule.
 */
export async function escalateOverdueClaims(now = new Date()): Promise<number> {
  const escalated = await sql()<
    { id: string; productTitle: string; makerName: string; orderNumber: string }[]
  >`
    update public.return_claims c set status = 'escalated', escalated_at = ${now}
    from public.order_items oi, public.makers m, public.orders o
    where c.status = 'open' and c.respond_by < ${now}
      and oi.id = c.order_item_id and m.id = c.seller_id and o.id = c.order_id
    returning c.id, oi.product_title, m.display_name as maker_name, o.order_number`;
  for (const c of escalated) {
    await sendEmail(emails.claimEscalated(env().ADMIN_NOTIFICATION_EMAIL, c));
    await audit('claim.escalated', { type: 'return_claim', id: c.id }, {});
  }
  return escalated.length;
}

/** Claims that need attention: open or escalated (for one maker, or all for admin). */
export async function countClaimsNeedingAttention(makerId?: string | null): Promise<number> {
  const [row] = await sql()<{ count: number }[]>`
    select count(*)::int as count from public.return_claims
    where status in ('open', 'escalated') ${makerId ? sql()`and seller_id = ${makerId}` : sql()``}`;
  return row?.count ?? 0;
}

/** An internal note on a case (admin only; RLS refuses anyone else). */
export async function addCaseNote(admin: Actor, claimId: string, body: string) {
  const text = sanitizeText(body).trim().slice(0, 2000);
  if (!text) throw new UserError('Write a note first.');
  await withUser(
    admin,
    (db) =>
      db`insert into public.case_notes (claim_id, author_id, body) values (${claimId}, ${admin.id}, ${text})`,
  );
}

export async function listCaseNotes(admin: Actor, claimId: string) {
  return withUser(
    admin,
    (db) => db<{ id: string; body: string; createdAt: Date; author: string | null }[]>`
      select n.id, n.body, n.created_at, u.display_name as author
      from public.case_notes n left join public.users u on u.id = n.author_id
      where n.claim_id = ${claimId} order by n.created_at`,
  );
}
