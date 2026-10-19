import { audit } from '@/lib/audit';
import { sql, withUser } from '@/lib/db';
import { env } from '@/lib/env';
import { emails } from '@/lib/email/templates';
import { sendEmail } from '@/lib/email/send';
import { sanitizeText } from '@/lib/domain/moderation';
import { addBusinessDays } from '@/lib/domain/claims';
import type { SessionUser } from '@/lib/auth/session';
import { SITE } from '@/lib/site/config';
import { reportError } from '@/lib/log';
import { verifyClaimPhotos } from '@/lib/claim-photos';
import {
  getReturnPolicy,
  returnBlocker,
  returnDeadline,
  type StoredReturnPolicy,
} from '@/lib/returns/policy';
import type { ReturnReason, ReturnStatus } from '@/lib/returns/status';
import { checkDelivery, trackingConfigured } from '@/lib/studio/tracking';
import { refundOrderItem } from './webhook';
import { UserError } from './errors';

type Actor = Pick<SessionUser, 'id' | 'role' | 'makerId'>;

export { RETURN_REASONS, RETURN_STATUS_LABEL } from '@/lib/returns/status';
export type { ReturnReason, ReturnStatus } from '@/lib/returns/status';

/** Statuses where the item is still coming back and nothing's been decided. */
const LIVE: ReturnStatus[] = ['requested', 'in_transit'];

export interface ReturnView {
  id: string;
  number: string;
  orderId: string;
  orderNumber: string;
  orderItemId: string;
  buyerId: string;
  buyerFirstName: string;
  buyerEmail: string;
  makerId: string;
  makerName: string;
  productTitle: string;
  variantLabel: string;
  imageUrl: string | null;
  lineTotalCents: number;
  refundedCents: number;
  reason: ReturnReason | null;
  reasonNote: string | null;
  status: ReturnStatus;
  carrier: string | null;
  tracking: string | null;
  requestedAt: Date;
  deliveredAt: Date | null;
  confirmBy: Date | null;
  receivedAt: Date | null;
  refundedAt: Date | null;
  refundAmount: number | null;
  refundSource: string | null;
  makerNote: string | null;
  adminNote: string | null;
  claimId: string | null;
  /** When the buyer should have posted it by. */
  sendBy: Date;
}

const returnSelect = () => sql()`
  select r.id, r.number, r.order_id, o.order_number, r.order_item_id, r.buyer_id,
    split_part(coalesce(nullif(o.buyer_name, ''), 'The buyer'), ' ', 1) as buyer_first_name, o.buyer_email,
    r.maker_id, m.display_name as maker_name, oi.product_title, oi.variant_label, oi.image_url,
    oi.line_total_cents, oi.refunded_cents, r.reason, r.reason_note, r.status, r.carrier, r.tracking,
    r.requested_at, r.delivered_at, r.confirm_by, r.received_at, r.refunded_at, r.refund_amount, r.refund_source,
    r.maker_note, r.admin_note, r.claim_id,
    r.requested_at + make_interval(days => ${SITE.returns.sendWithinDays}) as send_by
  from public.returns r
  join public.orders o on o.id = r.order_id
  join public.order_items oi on oi.id = r.order_item_id
  join public.makers m on m.id = r.maker_id`;

async function getReturn(returnId: string): Promise<ReturnView | null> {
  const [r] = await sql()<ReturnView[]>`${returnSelect()} where r.id = ${returnId}`;
  return r ?? null;
}

export interface ReturnableItem {
  id: string;
  orderId: string;
  orderNumber: string;
  makerId: string;
  makerName: string;
  productTitle: string;
  productType: string;
  variantLabel: string;
  imageUrl: string | null;
  lineTotalCents: number;
  refundedCents: number;
  deliveredAt: Date | null;
  returnPolicy: StoredReturnPolicy | null;
  hasOpenCase: boolean;
  /** The item's current return, if one was started and isn't cancelled or rejected. */
  returnId: string | null;
}

/** The buyer's own order item and what's needed to decide whether it can come back. */
export async function getReturnableItem(
  buyer: Actor,
  orderItemId: string,
): Promise<ReturnableItem | null> {
  if (!/^[0-9a-f-]{36}$/i.test(orderItemId)) return null;
  const [item] = await withUser(
    buyer,
    (db) => db<ReturnableItem[]>`
    select oi.id, oi.order_id, o.order_number, oi.maker_id, m.display_name as maker_name, oi.product_title,
      oi.product_type, oi.variant_label, oi.image_url, oi.line_total_cents, oi.refunded_cents,
      coalesce(oi.delivered_at, f.delivered_at) as delivered_at, oi.return_policy,
      exists (select 1 from public.return_claims c where c.order_item_id = oi.id
              and c.status in ('open', 'seller_responded', 'escalated')) as has_open_case,
      (select r.id from public.returns r where r.order_item_id = oi.id
         and r.status not in ('cancelled', 'rejected') order by r.requested_at desc limit 1) as return_id
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    join public.fulfilments f on f.id = oi.fulfilment_id
    join public.makers m on m.id = oi.maker_id
    where oi.id = ${orderItemId} and o.buyer_user_id = ${buyer.id}`,
  );
  return item ?? null;
}

export function blockerFor(item: ReturnableItem, now = new Date()): string | null {
  return returnBlocker(
    {
      returnPolicy: item.returnPolicy,
      productType: item.productType,
      deliveredAt: item.deliveredAt ? new Date(item.deliveredAt) : null,
      hasReturn: !!item.returnId,
      hasOpenCase: item.hasOpenCase,
      refunded: item.refundedCents >= item.lineTotalCents,
    },
    now,
  );
}

/** The return as its buyer sees it, with the maker's address (only once a return exists). */
export async function getBuyerReturn(buyer: Actor, returnId: string) {
  const r = await getReturn(returnId);
  if (!r || r.buyerId !== buyer.id) return null;
  const [m] = await sql()<{ returnAddress: string | null }[]>`
    select return_address from public.makers where id = ${r.makerId}`;
  return { ...r, returnAddress: m?.returnAddress ?? null };
}

/**
 * Starts a change-of-mind return for a ready-to-ship piece: delivered, inside the window, no
 * return or open problem report already. The buyer confirms it's unworn with tags; the maker is
 * emailed, and the buyer gets the address and steps.
 */
export async function startReturn(
  buyer: Actor,
  input: {
    orderItemId: string;
    reason?: ReturnReason | null;
    reasonNote?: string | null;
    conditionConfirmed: boolean;
  },
  now = new Date(),
): Promise<{ id: string; number: string }> {
  const item = await getReturnableItem(buyer, input.orderItemId);
  if (!item) throw new UserError('We couldn’t find that piece in your orders.');
  const blocker = blockerFor(item, now);
  if (blocker) throw new UserError(blocker);
  if (!input.conditionConfirmed)
    throw new UserError(`Please confirm it’s ${SITE.returns.condition}.`);

  let row: { id: string; number: string } | undefined;
  try {
    [row] = await sql()<{ id: string; number: string }[]>`
      insert into public.returns (order_id, order_item_id, buyer_id, maker_id, reason, reason_note, requested_at)
      values (${item.orderId}, ${item.id}, ${buyer.id}, ${item.makerId}, ${input.reason ?? null},
        ${input.reasonNote ? sanitizeText(input.reasonNote).slice(0, 1000) : null}, ${now})
      returning id, number`;
  } catch (err) {
    if ((err as { code?: string }).code === '23505')
      throw new UserError('A return has already been started for this piece.');
    throw err;
  }

  const r = (await getReturn(row!.id))!;
  const [maker] = await sql()<{ email: string; returnAddress: string | null }[]>`
    select u.email, m.return_address from public.makers m join public.users u on u.id = m.user_id
    where m.id = ${item.makerId}`;
  await sendEmail(
    emails.returnStartedBuyer(r.buyerEmail, {
      id: r.id,
      number: r.number,
      orderNumber: r.orderNumber,
      itemId: item.id,
      productTitle: item.productTitle,
      makerName: item.makerName,
      address: maker?.returnAddress ?? null,
      sendWithinDays: SITE.returns.sendWithinDays,
      confirmDays: SITE.returns.makerConfirmDays,
    }),
  );
  if (maker)
    await sendEmail(
      emails.returnIncomingMaker(maker.email, {
        id: r.id,
        number: r.number,
        productTitle: item.productTitle,
        variant: item.variantLabel,
        buyerFirstName: r.buyerFirstName,
        tracking: null,
        hasAddress: !!maker.returnAddress,
        confirmDays: SITE.returns.makerConfirmDays,
      }),
    );
  await audit('return.started', { type: 'return', id: r.id }, { reason: input.reason }, buyer.id);
  return { id: r.id, number: r.number };
}

/** The buyer adds (or corrects) tracking; the return is then on its way back. */
export async function addReturnTracking(
  buyer: Actor,
  returnId: string,
  input: { carrier: 'auspost' | 'sendle' | 'other'; tracking: string },
) {
  const r = await getReturn(returnId);
  if (!r || r.buyerId !== buyer.id) throw new UserError('Return not found.');
  if (!LIVE.includes(r.status)) throw new UserError('This return can’t be changed now.');
  const tracking = sanitizeText(input.tracking).replace(/\s+/g, '').slice(0, 80);
  if (tracking.length < 6) throw new UserError('Add the tracking number from your receipt.');
  await sql()`
    update public.returns set carrier = ${input.carrier}, tracking = ${tracking}, status = 'in_transit', updated_at = now()
    where id = ${returnId}`;
  if (!r.tracking) {
    const [maker] = await sql()<{ email: string; hasAddress: boolean }[]>`
      select u.email, m.return_address is not null as has_address from public.makers m
      join public.users u on u.id = m.user_id where m.id = ${r.makerId}`;
    if (maker)
      await sendEmail(
        emails.returnIncomingMaker(maker.email, {
          id: r.id,
          number: r.number,
          productTitle: r.productTitle,
          variant: r.variantLabel,
          buyerFirstName: r.buyerFirstName,
          tracking,
          hasAddress: maker.hasAddress,
          confirmDays: SITE.returns.makerConfirmDays,
        }),
      );
  }
  await audit(
    'return.tracking',
    { type: 'return', id: returnId },
    { carrier: input.carrier },
    buyer.id,
  );
}

/**
 * Refunds a return: the item price goes back to the buyer (original shipping isn't refunded) and
 * the maker's share of it is reversed from their transfer, or taken from their next payout.
 */
async function refundReturn(
  r: ReturnView,
  source: 'maker' | 'auto' | 'admin',
  actorUserId: string | null,
  now = new Date(),
) {
  const amount = r.lineTotalCents - r.refundedCents;
  if (amount <= 0) throw new UserError('This piece has already been refunded.');
  // Claim the row first so two clicks (or the job and a click) can't refund twice.
  const claimed = await sql()`
    update public.returns set status = 'received', received_at = coalesce(received_at, ${now}), updated_at = now()
    where id = ${r.id} and status in ('requested', 'in_transit', 'disputed') returning id`;
  if (!claimed.length) throw new UserError('This return has already been settled.');
  try {
    const res = await refundOrderItem({
      orderItemId: r.orderItemId,
      amountCents: amount,
      reason: `return:${r.number}`,
      actorUserId,
      returnId: r.id,
      adjustmentReason: `Return ${r.number}`,
    });
    await sql()`
      update public.returns set status = 'refunded', refunded_at = ${now}, refund_amount = ${res.amountCents},
        refund_source = ${source}, updated_at = now()
      where id = ${r.id}`;
    await sendEmail(
      emails.returnRefundedBuyer(r.buyerEmail, {
        id: r.id,
        number: r.number,
        productTitle: r.productTitle,
        amountCents: res.amountCents,
      }),
    );
    await audit(
      'return.refunded',
      { type: 'return', id: r.id },
      { amount: res.amountCents, source, reversal: res.reversal },
      actorUserId,
    );
    return res;
  } catch (err) {
    // Put it back so it can be tried again.
    await sql()`update public.returns set status = ${r.status}, updated_at = now() where id = ${r.id} and status = 'received'`;
    throw err;
  }
}

// ---------------------------------------------------------------------------------------------
// Maker side
// ---------------------------------------------------------------------------------------------

export async function listMakerReturns(seller: Actor): Promise<ReturnView[]> {
  if (!seller.makerId) return [];
  return sql()<ReturnView[]>`
    ${returnSelect()} where r.maker_id = ${seller.makerId}
    order by (r.status in ('requested', 'in_transit')) desc, r.requested_at desc limit 200`;
}

export async function countOpenMakerReturns(makerId: string): Promise<number> {
  const [n] = await sql()<{ n: number }[]>`
    select count(*)::int as n from public.returns where maker_id = ${makerId} and status in ('requested', 'in_transit')`;
  return n?.n ?? 0;
}

/** "Mark as received": the buyer is refunded straight away. */
export async function markReturnReceived(seller: Actor, returnId: string) {
  const r = await getReturn(returnId);
  if (!r || r.makerId !== seller.makerId) throw new UserError('Return not found.');
  if (!LIVE.includes(r.status)) throw new UserError('This return has already been settled.');
  return refundReturn(r, 'maker', seller.id);
}

/**
 * "There's a problem with it" (worn, damaged, tags missing): never an automatic rejection. It
 * opens a case for One Off to decide, with the maker's photos and note.
 */
export async function reportReturnProblem(
  seller: Actor,
  returnId: string,
  input: { note: string; photos: string[] },
  now = new Date(),
) {
  const r = await getReturn(returnId);
  if (!r || r.makerId !== seller.makerId) throw new UserError('Return not found.');
  if (!LIVE.includes(r.status)) throw new UserError('This return has already been settled.');
  const note = sanitizeText(input.note);
  if (note.length < 20)
    throw new UserError('Tell us what’s wrong with it (at least 20 characters).');
  await verifyClaimPhotos(seller.id, input.photos, true);
  const [numbered] = await sql()<
    { caseNumber: string }[]
  >`select public.next_case_number() as case_number`;
  const [claim] = await sql()<{ id: string }[]>`
    insert into public.return_claims (order_id, order_item_id, buyer_id, seller_id, reason, details, photos, status,
      respond_by, escalated_at, created_at, case_number, fulfilment_id, platform_due_at, return_id)
    select ${r.orderId}, ${r.orderItemId}, ${r.buyerId}, ${r.makerId}, 'return_condition'::claim_reason,
      ${note.slice(0, 4000)}, ${input.photos}, 'escalated', ${now}, ${now}, ${now}, ${numbered!.caseNumber},
      oi.fulfilment_id, ${addBusinessDays(now, SITE.cases.platformDecisionBusinessDays)}, ${r.id}
    from public.order_items oi where oi.id = ${r.orderItemId}
    returning id`;
  await sql()`
    update public.returns set status = 'disputed', received_at = coalesce(received_at, ${now}),
      maker_note = ${note.slice(0, 2000)}, claim_id = ${claim!.id}, updated_at = now()
    where id = ${r.id}`;
  await sendEmail(
    emails.claimNewSupport(env().ADMIN_NOTIFICATION_EMAIL, {
      id: claim!.id,
      productTitle: r.productTitle,
      orderNumber: r.orderNumber,
      reason: `Return ${r.number}: the maker says it came back not as sent`,
      makerName: r.makerName,
    }),
  );
  await audit('return.disputed', { type: 'return', id: r.id }, { claimId: claim!.id }, seller.id);
  return { claimId: claim!.id, caseNumber: numbered!.caseNumber };
}

/** Called when One Off decides a case opened from a return. */
export async function settleDisputedReturn(
  claimId: string,
  outcome: 'refunded' | 'rejected',
  refundCents: number | null,
  note: string | null,
) {
  await sql()`
    update public.returns set status = ${outcome}, admin_note = ${note},
      refunded_at = case when ${outcome} = 'refunded' then now() else refunded_at end,
      refund_amount = coalesce(${refundCents}, refund_amount),
      refund_source = case when ${outcome} = 'refunded' then 'admin' else refund_source end, updated_at = now()
    where claim_id = ${claimId} and status = 'disputed'`;
}

// ---------------------------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------------------------

/**
 * Daily: asks the carrier whether returns on their way back have arrived, then refunds any the
 * maker hasn't confirmed within SITE.returns.makerConfirmDays business days of that delivery.
 */
export async function processReturns(
  now = new Date(),
): Promise<{ delivered: number; refunded: number }> {
  let delivered = 0;
  const moving = await sql()<{ id: string; carrier: string; tracking: string }[]>`
    select id, carrier, tracking from public.returns
    where status = 'in_transit' and delivered_at is null and tracking is not null
    order by requested_at limit 200`;
  for (const r of moving) {
    if (!trackingConfigured(r.carrier)) continue;
    const res = await checkDelivery(r.carrier, r.tracking);
    if (res && (await markReturnDelivered(r.id, res.deliveredAt))) delivered++;
  }

  let refunded = 0;
  const due = await sql()<{ id: string }[]>`
    select id from public.returns
    where status in ('requested', 'in_transit') and confirm_by is not null and confirm_by <= ${now}`;
  for (const { id } of due) {
    const r = await getReturn(id);
    if (!r) continue;
    try {
      const res = await refundReturn(r, 'auto', null, now);
      refunded++;
      const [maker] = await sql()<{ email: string }[]>`
        select u.email from public.makers m join public.users u on u.id = m.user_id where m.id = ${r.makerId}`;
      if (maker)
        await sendEmail(
          emails.returnAutoRefundedMaker(maker.email, {
            id: r.id,
            number: r.number,
            productTitle: r.productTitle,
            amountCents: res.amountCents,
          }),
        );
    } catch (err) {
      reportError(err, { where: 'auto refund return', returnId: id });
    }
  }
  return { delivered, refunded };
}

/** Tracking (or One Off) says it's back with the maker: their confirm clock starts. */
export async function markReturnDelivered(returnId: string, at: Date): Promise<boolean> {
  const rows = await sql()`
    update public.returns set delivered_at = ${at},
      confirm_by = ${addBusinessDays(at, SITE.returns.makerConfirmDays)}, updated_at = now()
    where id = ${returnId} and status in ('requested', 'in_transit') and delivered_at is null
    returning id`;
  return rows.length > 0;
}

// ---------------------------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------------------------

export async function listReturns(filter: {
  status?: string | null;
  makerId?: string | null;
}): Promise<ReturnView[]> {
  return sql()<ReturnView[]>`
    ${returnSelect()}
    where true
      ${filter.status ? sql()`and r.status = ${filter.status}` : sql()``}
      ${filter.makerId ? sql()`and r.maker_id = ${filter.makerId}` : sql()``}
    order by r.requested_at desc limit 300`;
}

/** Admin override: refund now, or close the return as not accepted. A note is required. */
export async function adminSettleReturn(
  admin: Actor,
  returnId: string,
  input: { action: 'refund' | 'reject'; note: string },
) {
  if (admin.role !== 'admin') throw new UserError('Only One Off can do that.');
  const note = sanitizeText(input.note);
  if (note.length < 10) throw new UserError('Add a note explaining the decision.');
  const r = await getReturn(returnId);
  if (!r) throw new UserError('Return not found.');
  if (!['requested', 'in_transit', 'disputed'].includes(r.status))
    throw new UserError('This return has already been settled.');
  await sql()`update public.returns set admin_note = ${note.slice(0, 2000)} where id = ${r.id}`;
  if (input.action === 'refund') await refundReturn(r, 'admin', admin.id);
  else {
    await sql()`
      update public.returns set status = 'rejected', updated_at = now() where id = ${r.id}`;
    await audit('return.rejected', { type: 'return', id: r.id }, { note }, admin.id);
  }
}

/** For the buyer's order page: "Ready to ship · return by 3 Nov". */
export function returnByLine(deliveredAt: Date, policy: StoredReturnPolicy | null, type: string) {
  const days = policy?.windowDays ?? getReturnPolicy(type).windowDays ?? 0;
  return returnDeadline(new Date(deliveredAt), days);
}
