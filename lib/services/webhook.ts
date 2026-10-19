import type Stripe from 'stripe';
import { audit } from '@/lib/audit';
import { sql, type Db } from '@/lib/db';
import { formatDateRange } from '@/lib/domain/leadTime';
import { emails } from '@/lib/email/templates';
import { sendEmail } from '@/lib/email/send';
import { env } from '@/lib/env';
import { log, reportError } from '@/lib/log';
import { payments } from '@/lib/payments';
import { accountInfo } from '@/lib/payments/stripe';
import { recordProcessingFees, upsertPayout } from './payouts';
import { notifyLowStock, notifyNewOrder } from './notifications';

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
      case 'payout.paid':
      case 'payout.failed':
        await onPayout(event.data.object as Stripe.Payout, event.account ?? null);
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
    const soldVariants = items.filter((i) => !oversold.includes(i)).map((i) => i.variantId);
    return { order, oversold, email, soldVariants };
  });
  if (!result) return;

  const { order, oversold, email, soldVariants } = result;

  // Oversold pieces (two buyers raced for the last unit) are refunded immediately.
  for (const item of oversold) {
    await refundOrderItem({ orderItemId: item.id, reason: 'oversold', actorUserId: null }).catch(
      (err) => reportError(err, { orderItemId: item.id, where: 'oversold refund' }),
    );
  }

  // Makers are paid later, once the order is delivered (see releaseDueTransfers); for now
  // record Stripe's processing fee so each maker's net is final.
  await recordProcessingFees(order.id, session.chargeId);
  await sendOrderEmails(order.id, email);
  await notifyLowStock(soldVariants).catch((err) => reportError(err, { where: 'low stock' }));
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
  for (const fulfilmentId of new Set(items.map((i) => i.fulfilmentId)))
    await notifyNewOrder(fulfilmentId).catch((err) =>
      reportError(err, { fulfilmentId, where: 'new order notification' }),
    );
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
  const info = accountInfo(account);
  await sql()`
    update public.makers set stripe_onboarding_complete = ${info.detailsSubmitted},
      stripe_charges_enabled = ${info.chargesEnabled}, stripe_payouts_enabled = ${info.payoutsEnabled},
      bank_name = coalesce(${info.bankName}, bank_name), bank_last4 = coalesce(${info.bankLast4}, bank_last4)
    where stripe_account_id = ${account.id}`;
  await audit(
    'connect.account_updated',
    { type: 'stripe_account', id: account.id },
    {
      detailsSubmitted: info.detailsSubmitted,
      chargesEnabled: info.chargesEnabled,
      payoutsEnabled: info.payoutsEnabled,
    },
  );
}

/** payout.paid / payout.failed on a maker's connected account. */
async function onPayout(payout: Stripe.Payout, accountId: string | null) {
  if (!accountId) return; // platform payouts aren't makers'
  const saved = await upsertPayout(accountId, {
    id: payout.id,
    amount: payout.amount,
    arrivalDate: payout.arrival_date ? new Date(payout.arrival_date * 1000) : null,
    status: payout.status,
    failureMessage: payout.failure_message,
  });
  if (!saved) return;
  const [maker] = await sql()<
    {
      displayName: string;
      email: string | null;
      bankName: string | null;
      bankLast4: string | null;
    }[]
  >`
    select m.display_name, u.email, m.bank_name, m.bank_last4
    from public.makers m left join public.users u on u.id = m.user_id where m.id = ${saved.makerId}`;
  await audit(
    `payout.${payout.status}`,
    { type: 'maker', id: saved.makerId },
    {
      payoutId: payout.id,
      amount: payout.amount,
      code: payout.failure_code ?? null,
    },
  );
  if (!maker?.email) return;
  if (payout.status === 'failed')
    await sendEmail(emails.payoutFailed(maker.email, maker.displayName));
  else if (payout.status === 'paid' && saved.isNew) {
    const { notifyPayoutSent } = await import('./notifications');
    await notifyPayoutSent(saved.makerId, payout.amount, maker);
  }
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
