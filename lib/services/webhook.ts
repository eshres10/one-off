import type Stripe from 'stripe';
import { audit } from '@/lib/audit';
import { sql, type Db } from '@/lib/db';
import { formatDateRange } from '@/lib/domain/leadTime';
import { emails } from '@/lib/email/templates';
import { sendEmail } from '@/lib/email/send';
import { env } from '@/lib/env';
import { log, reportError } from '@/lib/log';
import { payments } from '@/lib/payments';

export type WebhookOutcome = 'processed' | 'duplicate' | 'ignored';

/**
 * Processes a verified Stripe event exactly once. The event id is recorded first; a replay of
 * the same id is acknowledged without side effects. Payment state is always re-fetched from
 * Stripe rather than trusted from the event payload or the browser.
 */
export async function handleStripeEvent(event: Stripe.Event): Promise<WebhookOutcome> {
  const inserted = await sql()`
    insert into public.stripe_events (id, type, account, livemode) values (${event.id}, ${event.type}, ${event.account ?? null}, ${event.livemode})
    on conflict (id) do nothing returning id`;
  if (inserted.length === 0) {
    const [prior] = await sql()<
      { processedAt: Date | null }[]
    >`select processed_at from public.stripe_events where id = ${event.id}`;
    if (prior?.processedAt) return 'duplicate';
    // A previous attempt failed part-way; handlers are idempotent so it is safe to retry.
  }

  try {
    let outcome: WebhookOutcome = 'processed';
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        await onCheckoutCompleted((event.data.object as Stripe.Checkout.Session).id);
        break;
      case 'checkout.session.expired':
        await onCheckoutExpired((event.data.object as Stripe.Checkout.Session).id);
        break;
      case 'payment_intent.succeeded':
        await audit('payment_intent.succeeded', {
          type: 'payment_intent',
          id: (event.data.object as Stripe.PaymentIntent).id,
        });
        break;
      case 'payment_intent.payment_failed':
        await onPaymentFailed(event.data.object as Stripe.PaymentIntent);
        break;
      case 'charge.refunded':
        await onChargeRefunded(event.data.object as Stripe.Charge);
        break;
      case 'charge.dispute.created':
        await onDisputeCreated(event.data.object as Stripe.Dispute);
        break;
      case 'account.updated':
        await onAccountUpdated(event.data.object as Stripe.Account);
        break;
      case 'payout.failed':
        await onPayoutFailed(event.data.object as Stripe.Payout, event.account ?? null);
        break;
      default:
        outcome = 'ignored';
    }
    await sql()`update public.stripe_events set processed_at = now(), error = null where id = ${event.id}`;
    return outcome;
  } catch (err) {
    await sql()`update public.stripe_events set error = ${err instanceof Error ? err.message : String(err)} where id = ${event.id}`;
    throw err;
  }
}

interface OrderRow {
  id: string;
  orderNumber: string;
  status: string;
  totalCents: number;
  buyerUserId: string | null;
}

export async function onCheckoutCompleted(sessionId: string): Promise<void> {
  const session = await payments().retrieveCheckoutSession(sessionId);
  if (session.paymentStatus !== 'paid') {
    log.info(
      { sessionId, paymentStatus: session.paymentStatus },
      'checkout completed but not yet paid',
    );
    return;
  }
  if (session.metadata.kind === 'commission_deposit') {
    const { onDepositPaid } = await import('./commissions');
    await onDepositPaid(session);
    return;
  }

  const result = await sql().begin(async (tx) => {
    const db = tx as unknown as Db;
    const [order] = await db<OrderRow[]>`
      select id, order_number, status, total_cents, buyer_user_id from public.orders
      where stripe_checkout_session_id = ${sessionId} for update`;
    if (!order) throw new Error(`No order for checkout session ${sessionId}`);
    if (order.status !== 'pending') return null; // already processed

    if (session.amountTotal !== order.totalCents || session.currency.toLowerCase() !== 'aud') {
      await audit(
        'payment.amount_mismatch',
        { type: 'order', id: order.id },
        { expected: order.totalCents, got: session.amountTotal },
        null,
        db,
      );
    }

    const items = await db<
      { id: string; variantId: string; quantity: number; lineTotalCents: number; makerId: string }[]
    >`
      select id, variant_id, quantity, line_total_cents, maker_id from public.order_items where order_id = ${order.id}`;
    const oversold: Array<(typeof items)[number]> = [];
    for (const item of items) {
      const [stock] = await db<
        { ok: boolean }[]
      >`select public.decrement_stock(${item.variantId}, ${item.quantity}) as ok`;
      if (!stock?.ok) oversold.push(item);
    }

    const email = session.customerEmail ?? 'unknown@checkout.invalid';
    await db`
      update public.orders set status = 'paid', paid_at = now(), stripe_payment_intent_id = ${session.paymentIntentId},
        stripe_charge_id = ${session.chargeId}, buyer_email = ${email}, buyer_name = ${session.customerName},
        shipping_address = ${session.shippingAddress ? db.json(session.shippingAddress as never) : null}
      where id = ${order.id}`;
    // Signed-in buyers keep their order; guests are linked if an account with this email exists.
    if (!order.buyerUserId) {
      await db`
        update public.orders o set buyer_user_id = u.id from public.users u
        where o.id = ${order.id} and lower(u.email) = lower(${email})`;
    }
    if (session.metadata.cart_id)
      await db`delete from public.cart_items where cart_id = ${session.metadata.cart_id}`;
    await audit(
      'payment.succeeded',
      { type: 'order', id: order.id },
      { sessionId, total: session.amountTotal },
      null,
      db,
    );
    return { order, oversold, email };
  });
  if (!result) return;

  const { order, oversold, email } = result;

  // Oversold pieces (two buyers raced for the last unit) are refunded immediately.
  for (const item of oversold) {
    await refundOrderItem({ orderItemId: item.id, reason: 'oversold', actorUserId: null }).catch(
      (err) => reportError(err, { orderItemId: item.id, where: 'oversold refund' }),
    );
  }

  await createTransfersForOrder(order.id, session.chargeId);
  await sendOrderEmails(order.id, email);
}

export async function createTransfersForOrder(
  orderId: string,
  chargeId: string | null,
): Promise<void> {
  const rows = await sql()<
    {
      id: string;
      makerId: string;
      sellerNetCents: number;
      stripeAccountId: string | null;
      onboarded: boolean;
      transferStatus: string;
      status: string;
      refundedShare: number;
    }[]
  >`
    select f.id, f.maker_id, f.seller_net_cents, m.stripe_account_id, m.stripe_onboarding_complete as onboarded, f.transfer_status,
           f.status,
           coalesce((select sum(round(oi.refunded_cents::numeric * oi.seller_net_cents / oi.line_total_cents))
                     from public.order_items oi where oi.fulfilment_id = f.id), 0)::int as refunded_share
    from public.fulfilments f join public.makers m on m.id = f.maker_id
    where f.order_id = ${orderId}`;
  for (const f of rows) {
    if (f.transferStatus !== 'pending') continue;
    if (f.status === 'refunded') {
      await sql()`update public.fulfilments set transfer_status = 'skipped' where id = ${f.id}`;
      continue;
    }
    if (!f.stripeAccountId || !f.onboarded) {
      await sql()`update public.fulfilments set transfer_status = 'skipped' where id = ${f.id}`;
      await audit(
        'transfer.skipped',
        { type: 'fulfilment', id: f.id },
        { reason: 'maker not onboarded to Stripe' },
      );
      continue;
    }
    try {
      // Items refunded before the transfer (e.g. oversold) are excluded from the maker's share.
      const amount = f.sellerNetCents - f.refundedShare;
      const transfer = await payments().createTransfer({
        amountCents: amount,
        destination: f.stripeAccountId,
        transferGroup: orderId,
        sourceTransaction: chargeId,
        metadata: { order_id: orderId, fulfilment_id: f.id, maker_id: f.makerId },
        idempotencyKey: `transfer:${f.id}`,
      });
      await sql()`update public.fulfilments set stripe_transfer_id = ${transfer.id}, transfer_status = 'created' where id = ${f.id}`;
      await audit(
        'transfer.created',
        { type: 'fulfilment', id: f.id },
        { amount, transferId: transfer.id },
      );
    } catch (err) {
      reportError(err, { fulfilmentId: f.id, where: 'createTransfer' });
      await sql()`update public.fulfilments set transfer_status = 'failed' where id = ${f.id}`;
      await audit('transfer.failed', { type: 'fulfilment', id: f.id }, { error: String(err) });
    }
  }
}

async function sendOrderEmails(orderId: string, buyerEmail: string) {
  const [order] = await sql()<{ id: string; orderNumber: string; totalCents: number }[]>`
    select id, order_number, total_cents from public.orders where id = ${orderId}`;
  if (!order) return;
  const items = await sql()<
    {
      productTitle: string;
      variantLabel: string;
      quantity: number;
      makerName: string;
      makerEmail: string;
      fulfilmentId: string;
      sellerNetCents: number;
      from: Date;
      to: Date;
    }[]
  >`
    select oi.product_title, oi.variant_label, oi.quantity, m.display_name as maker_name, u.email as maker_email,
           f.id as fulfilment_id, f.seller_net_cents, f.estimated_delivery_from as from, f.estimated_delivery_to as to
    from public.order_items oi join public.fulfilments f on f.id = oi.fulfilment_id
    join public.makers m on m.id = oi.maker_id join public.users u on u.id = m.user_id
    where oi.order_id = ${orderId} and oi.fulfilment_status <> 'refunded'`;
  await sendEmail(
    emails.orderConfirmation(
      buyerEmail,
      order,
      items.map((i) => ({
        title: i.productTitle,
        variant: i.variantLabel,
        maker: i.makerName,
        quantity: i.quantity,
        estimate: `Estimated delivery ${formatDateRange(new Date(i.from), new Date(i.to))}`,
      })),
    ),
  );
  const byFulfilment = new Map<string, Array<(typeof items)[number]>>();
  for (const i of items)
    byFulfilment.set(i.fulfilmentId, [...(byFulfilment.get(i.fulfilmentId) ?? []), i]);
  for (const group of byFulfilment.values()) {
    const first = group[0]!;
    await sendEmail(
      emails.makerNewOrder(
        first.makerEmail,
        order,
        group.map((g) => ({
          title: g.productTitle,
          variant: g.variantLabel,
          quantity: g.quantity,
        })),
        first.sellerNetCents,
      ),
    );
  }
}

async function onCheckoutExpired(sessionId: string) {
  await sql()`update public.orders set status = 'cancelled' where stripe_checkout_session_id = ${sessionId} and status = 'pending'`;
}

async function onPaymentFailed(pi: Stripe.PaymentIntent) {
  const orderId = pi.metadata?.order_id;
  if (!orderId) return;
  await sql()`update public.orders set status = 'failed' where id = ${orderId} and status = 'pending'`;
  await audit(
    'payment.failed',
    { type: 'order', id: orderId },
    { reason: pi.last_payment_error?.code ?? null },
  );
}

/** Syncs refund totals from Stripe's charge (absolute values, so replays are harmless). */
async function onChargeRefunded(charge: Stripe.Charge) {
  const piId =
    typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
  const [order] = await sql()<{ id: string; totalCents: number }[]>`
    select id, total_cents from public.orders where stripe_payment_intent_id = ${piId ?? ''} or stripe_charge_id = ${charge.id}`;
  if (!order) return;
  const refunded = charge.amount_refunded;
  const status =
    refunded >= order.totalCents ? 'refunded' : refunded > 0 ? 'partially_refunded' : 'paid';
  await sql()`update public.orders set refunded_cents = ${refunded}, status = ${status}::order_status where id = ${order.id}`;
  await audit('charge.refunded', { type: 'order', id: order.id }, { refunded });
}

async function onDisputeCreated(dispute: Stripe.Dispute) {
  const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge.id;
  const [order] = await sql()<
    { id: string }[]
  >`select id from public.orders where stripe_charge_id = ${chargeId}`;
  await sql()`
    insert into public.disputes (order_id, stripe_dispute_id, stripe_charge_id, amount_cents, reason, status, evidence_due_by)
    values (${order?.id ?? null}, ${dispute.id}, ${chargeId}, ${dispute.amount}, ${dispute.reason}, ${dispute.status},
      ${dispute.evidence_details?.due_by ? new Date(dispute.evidence_details.due_by * 1000) : null})
    on conflict (stripe_dispute_id) do update set status = excluded.status, evidence_due_by = excluded.evidence_due_by, updated_at = now()`;
  await audit(
    'dispute.created',
    { type: 'order', id: order?.id ?? null },
    { disputeId: dispute.id, amount: dispute.amount },
  );
  await sendEmail(
    emails.disputeAdmin(env().ADMIN_NOTIFICATION_EMAIL, dispute.id, dispute.amount, dispute.reason),
  );
}

async function onAccountUpdated(account: Stripe.Account) {
  const complete = Boolean(account.details_submitted && account.charges_enabled !== undefined);
  await sql()`
    update public.makers set stripe_onboarding_complete = ${Boolean(account.details_submitted)},
      stripe_payouts_enabled = ${Boolean(account.payouts_enabled)}
    where stripe_account_id = ${account.id}`;
  await audit(
    'connect.account_updated',
    { type: 'stripe_account', id: account.id },
    {
      detailsSubmitted: account.details_submitted,
      payoutsEnabled: account.payouts_enabled,
      complete,
    },
  );
}

async function onPayoutFailed(payout: Stripe.Payout, accountId: string | null) {
  const [maker] = await sql()<{ id: string; displayName: string; email: string }[]>`
    select m.id, m.display_name, u.email from public.makers m join public.users u on u.id = m.user_id
    where m.stripe_account_id = ${accountId ?? ''}`;
  await audit(
    'payout.failed',
    { type: 'maker', id: maker?.id ?? null },
    { payoutId: payout.id, amount: payout.amount, code: payout.failure_code },
  );
  if (maker) await sendEmail(emails.payoutFailed(maker.email, maker.displayName));
}

/**
 * Refunds one order item (fully, or `amountCents` of it) through Stripe and reverses the
 * matching share of the maker's transfer. Used by admin tooling and oversell protection.
 */
export async function refundOrderItem(input: {
  orderItemId: string;
  amountCents?: number;
  reason: string;
  actorUserId: string | null;
}): Promise<{ refundId: string; amountCents: number }> {
  const [item] = await sql()<
    {
      id: string;
      orderId: string;
      fulfilmentId: string;
      lineTotalCents: number;
      sellerNetCents: number;
      refundedCents: number;
      paymentIntentId: string | null;
      transferId: string | null;
    }[]
  >`
    select oi.id, oi.order_id, oi.fulfilment_id, oi.line_total_cents, oi.seller_net_cents, oi.refunded_cents,
           o.stripe_payment_intent_id as payment_intent_id, f.stripe_transfer_id as transfer_id
    from public.order_items oi join public.orders o on o.id = oi.order_id join public.fulfilments f on f.id = oi.fulfilment_id
    where oi.id = ${input.orderItemId}`;
  if (!item) throw new Error('Order item not found');
  if (!item.paymentIntentId) throw new Error('Order has not been paid');
  const remaining = item.lineTotalCents - item.refundedCents;
  const amount = input.amountCents ?? remaining;
  if (amount <= 0 || amount > remaining)
    throw new Error(`Refund must be between A$0.01 and the remaining ${remaining / 100}`);

  const refund = await payments().createRefund({
    paymentIntentId: item.paymentIntentId,
    amountCents: amount,
    metadata: { order_id: item.orderId, order_item_id: item.id, reason: input.reason },
    idempotencyKey: `refund:${item.id}:${item.refundedCents}:${amount}`,
  });

  // Claw back the maker's proportional share of what they were transferred for this item.
  if (item.transferId) {
    const reversal = Math.round((amount * item.sellerNetCents) / item.lineTotalCents);
    if (reversal > 0) {
      await payments()
        .reverseTransfer(item.transferId, reversal, `reversal:${refund.id}`)
        .catch((err) =>
          reportError(err, { where: 'reverseTransfer', transferId: item.transferId }),
        );
    }
  }

  const fullyRefunded = item.refundedCents + amount >= item.lineTotalCents;
  await sql().begin(async (tx) => {
    const db = tx as unknown as Db;
    await db`
      insert into public.refunds (order_id, order_item_id, amount_cents, reason, stripe_refund_id, status, created_by)
      values (${item.orderId}, ${item.id}, ${amount}, ${input.reason}, ${refund.id}, ${refund.status}, ${input.actorUserId})
      on conflict (stripe_refund_id) do nothing`;
    await db`
      update public.order_items set refunded_cents = refunded_cents + ${amount}
        ${fullyRefunded ? db`, fulfilment_status = 'refunded'` : db``}
      where id = ${item.id}`;
    await db`
      update public.orders o set refunded_cents = (select coalesce(sum(amount_cents), 0) from public.refunds r where r.order_id = o.id),
        status = case when (select coalesce(sum(amount_cents), 0) from public.refunds r where r.order_id = o.id) >= o.total_cents
                      then 'refunded'::order_status else 'partially_refunded'::order_status end
      where o.id = ${item.orderId}`;
    // A fulfilment whose items are all refunded is closed out.
    await db`
      update public.fulfilments f set status = 'refunded'
      where f.id = ${item.fulfilmentId}
        and not exists (select 1 from public.order_items oi where oi.fulfilment_id = f.id and oi.fulfilment_status <> 'refunded')`;
    await audit(
      'refund.created',
      { type: 'order_item', id: item.id },
      { amount, refundId: refund.id, reason: input.reason },
      input.actorUserId,
      db,
    );
  });
  return { refundId: refund.id, amountCents: amount };
}
