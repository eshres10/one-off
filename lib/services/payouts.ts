import { audit } from '@/lib/audit';
import { sql } from '@/lib/db';
import { log, reportError } from '@/lib/log';
import { payments } from '@/lib/payments';
import { TERMS } from '@/lib/studio/terms';
import { SITE } from '@/lib/site/config';
import { checkDelivery, trackingConfigured } from '@/lib/studio/tracking';

const DAY = 86_400_000;

/** Claims that hold a maker's money until they're resolved. */
export const ACTIVE_CLAIM = `('open', 'seller_responded', 'escalated')`;

/**
 * Records Stripe's actual processing fee for an order and splits it across the order's makers
 * in proportion to what each was paid (items + shipping). Each maker's net becomes
 * items + shipping − commission − their share of the fee. Safe to run more than once.
 */
export async function recordProcessingFees(orderId: string, chargeId: string | null) {
  let fee = 0;
  if (chargeId) {
    try {
      fee = await payments().getChargeFee(chargeId);
    } catch (err) {
      reportError(err, { where: 'getChargeFee', orderId });
    }
  }
  const rows = await sql()<
    { id: string; subtotalCents: number; shippingCents: number; commission: number }[]
  >`
    select id, subtotal_cents, shipping_cents, platform_commission_cents as commission
    from public.fulfilments where order_id = ${orderId} order by created_at, id`;
  const total = rows.reduce((s, r) => s + r.subtotalCents + r.shippingCents, 0);
  let left = fee;
  for (const [i, r] of rows.entries()) {
    const share =
      i === rows.length - 1
        ? left
        : total
          ? Math.round((fee * (r.subtotalCents + r.shippingCents)) / total)
          : 0;
    left -= share;
    await sql()`
      update public.fulfilments set processing_fee_cents = ${share},
        seller_net_cents = subtotal_cents + shipping_cents - platform_commission_cents - ${share}
      where id = ${r.id}`;
  }
}

/**
 * Splits what a maker is owed into the part funded by the buyer's charge and the part Off One
 * covers. The charge-funded part is at most net − subsidy − refunded share (so transfers from a
 * charge never add up to more than the buyer paid); the covered part tops up to what's owed and
 * is never more than the subsidy. Together they're exactly what's owed (or nothing).
 */
export function splitPayout(input: {
  owedCents: number;
  sellerNetCents: number;
  subsidyCents: number;
  refundedShareCents: number;
}): { amount: number; subsidyDue: number } {
  const owed = Math.max(0, input.owedCents);
  const fromCharge = input.sellerNetCents - input.subsidyCents - input.refundedShareCents;
  const amount = Math.max(0, Math.min(owed, fromCharge));
  const subsidyDue = Math.max(0, Math.min(input.subsidyCents, owed - amount));
  return { amount, subsidyDue };
}

/** Marks a shipped order delivered (carrier event, buyer confirmation, or the timeout). */
export async function markDelivered(
  fulfilmentId: string,
  source: 'carrier' | 'buyer' | 'auto' | 'admin',
  at = new Date(),
): Promise<boolean> {
  const updated = await sql()<{ id: string; makerId: string }[]>`
    update public.fulfilments set status = 'delivered', delivered_at = ${at}, delivery_source = ${source},
      payout_due_at = ${new Date(at.getTime() + TERMS.releaseDaysAfterDelivery * DAY)},
      payout_status = case when payout_status = 'held' then 'scheduled' else payout_status end
    where id = ${fulfilmentId} and status = 'shipped' returning id, maker_id`;
  if (!updated.length) return false;
  await sql()`
    update public.order_items set fulfilment_status = 'delivered', delivered_at = ${at}
    where fulfilment_id = ${fulfilmentId} and fulfilment_status <> 'refunded'`;
  await sql()`
    update public.makers m set completed_orders = (
      select count(*) from public.fulfilments f where f.maker_id = m.id and f.status in ('delivered', 'completed'))
    where id = ${updated[0]!.makerId}`;
  await audit('fulfilment.delivered', { type: 'fulfilment', id: fulfilmentId }, { source });
  return true;
}

/** Asks the carrier about shipped orders (only when its API keys are set). */
export async function pollCarrierDeliveries(): Promise<number> {
  const rows = await sql()<{ id: string; carrier: string; trackingNumber: string }[]>`
    select id, carrier, tracking_number from public.fulfilments
    where status = 'shipped' and tracking_number is not null and carrier in ('auspost', 'sendle')
    order by shipped_at limit 200`;
  let n = 0;
  for (const f of rows) {
    if (!trackingConfigured(f.carrier)) continue;
    const result = await checkDelivery(f.carrier, f.trackingNumber);
    if (result && (await markDelivered(f.id, 'carrier', result.deliveredAt))) n++;
  }
  return n;
}

/** Shipped orders with no delivery event after TERMS.autoDeliveredDaysAfterShip are delivered. */
export async function autoMarkDelivered(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - TERMS.autoDeliveredDaysAfterShip * DAY);
  const due = await sql()<{ id: string }[]>`
    select id from public.fulfilments where status = 'shipped' and shipped_at <= ${cutoff}`;
  let n = 0;
  for (const f of due) if (await markDelivered(f.id, 'auto', now)) n++;
  return n;
}

export interface ReleaseResult {
  released: number;
  waiting: number;
  held: number;
}

/**
 * Pays makers: every order delivered at least TERMS.releaseDaysAfterDelivery days ago, with no
 * open fault claim and no transfer yet, gets a Stripe transfer of the maker's net (less anything
 * already refunded) and is marked completed. The connected account's weekly payout then pays it
 * out. Idempotent: each transfer uses the fulfilment id as its idempotency key.
 */
export async function releaseDueTransfers(now = new Date()): Promise<ReleaseResult> {
  const rows = await sql()<
    {
      id: string;
      orderId: string;
      makerId: string;
      sellerNetCents: number;
      shippingSubsidyCents: number;
      refundedShare: number;
      stripeAccountId: string | null;
      chargesEnabled: boolean;
      chargeId: string | null;
      held: boolean;
    }[]
  >`
    select f.id, f.order_id, f.maker_id, f.seller_net_cents, f.shipping_subsidy_cents, m.stripe_account_id,
      m.stripe_charges_enabled as charges_enabled, o.stripe_charge_id as charge_id,
      coalesce((select sum(round(oi.refunded_cents::numeric * oi.seller_net_cents / oi.line_total_cents))
                from public.order_items oi where oi.fulfilment_id = f.id), 0)::int as refunded_share,
      exists (select 1 from public.return_claims c join public.order_items oi on oi.id = c.order_item_id
              where oi.fulfilment_id = f.id and c.status in ${sql().unsafe(ACTIVE_CLAIM)}) as held
    from public.fulfilments f
    join public.makers m on m.id = f.maker_id
    join public.orders o on o.id = f.order_id
    where f.status = 'delivered' and coalesce(f.payout_due_at, f.delivered_at + interval '1 day' * ${TERMS.releaseDaysAfterDelivery}) <= ${now}
      and f.payout_status <> 'paused'
      and f.stripe_transfer_id is null and f.transfer_status in ('pending', 'failed')
      and o.status in ('paid', 'partially_refunded')
      -- [DECIDE] SITE.returns.holdReadyToShipPayoutUntilWindowCloses (off by default): ready-to-ship
      -- orders wait until their change-of-mind window has closed.
      and (not ${SITE.returns.holdReadyToShipPayoutUntilWindowCloses}
        or not exists (select 1 from public.order_items oi where oi.fulfilment_id = f.id and oi.product_type = 'ready_to_ship')
        or f.delivered_at + make_interval(days => ${SITE.returns.readyToShipWindowDays}) <= ${now})`;

  const result: ReleaseResult = { released: 0, waiting: 0, held: 0 };
  for (const f of rows) {
    if (f.held) {
      result.held++;
      continue;
    }
    if (!f.stripeAccountId || !f.chargesEnabled) {
      result.waiting++;
      continue;
    }
    // Anything this maker owes from an earlier refund that couldn't be reversed comes off first.
    const owed = await sql()<{ id: string; amountCents: number }[]>`
      select id, amount_cents from public.maker_adjustments
      where maker_id = ${f.makerId} and applied_at is null order by created_at`;
    // What the maker is owed in total: their net, less refunds and anything they owe.
    let owedTotal = f.sellerNetCents - f.refundedShare;
    const applied: string[] = [];
    for (const a of owed) {
      if (a.amountCents > owedTotal) break;
      owedTotal -= a.amountCents;
      applied.push(a.id);
    }
    // It's paid in two parts. The buyer's charge only holds what the buyer paid, so the part
    // funded from it (source_transaction) leaves out the shipping Off One covered; that part
    // follows from the platform balance (releaseShippingSubsidies). Never more than owed.
    const { amount, subsidyDue } = splitPayout({
      owedCents: owedTotal,
      sellerNetCents: f.sellerNetCents,
      subsidyCents: f.shippingSubsidyCents,
      refundedShareCents: f.refundedShare,
    });
    try {
      let transferId: string | null = null;
      if (amount > 0) {
        const t = await payments().createTransfer({
          amountCents: amount,
          destination: f.stripeAccountId,
          transferGroup: f.orderId,
          sourceTransaction: f.chargeId,
          metadata: { order_id: f.orderId, fulfilment_id: f.id, maker_id: f.makerId },
          idempotencyKey: `transfer:${f.id}`,
        });
        transferId = t.id;
      }
      await sql()`
        update public.fulfilments set status = 'completed', stripe_transfer_id = ${transferId},
          transfer_status = ${transferId ? 'created' : 'skipped'}, transfer_released_at = ${now},
          payout_status = 'paid', transfer_amount_cents = ${transferId ? amount : 0},
          shipping_subsidy_due_cents = ${subsidyDue},
          shipping_subsidy_status = ${subsidyDue > 0 ? 'pending' : 'none'}
        where id = ${f.id}`;
      if (applied.length)
        await sql()`
          update public.maker_adjustments set applied_at = ${now}, applied_to_fulfilment_id = ${f.id}
          where id in ${sql()(applied)}`;
      await sql()`
        update public.order_items set fulfilment_status = 'completed'
        where fulfilment_id = ${f.id} and fulfilment_status = 'delivered'`;
      await audit(
        'transfer.created',
        { type: 'fulfilment', id: f.id },
        { amount, subsidyDue, transferId, adjustments: applied },
      );
      result.released++;
    } catch (err) {
      reportError(err, { fulfilmentId: f.id, where: 'releaseDueTransfers' });
      await sql()`update public.fulfilments set transfer_status = 'failed' where id = ${f.id}`;
      await audit('transfer.failed', { type: 'fulfilment', id: f.id }, { error: String(err) });
    }
  }
  log.info(result, 'transfers released');
  await releaseShippingSubsidies(now);
  return result;
}

/**
 * Pays makers the shipping Off One covered (the cross-maker cap or free-shipping threshold), once
 * their main transfer has gone out. It comes from the platform balance, not the buyer's charge,
 * so a low balance only delays this part: it's marked failed and retried on the next run.
 * Idempotent per attempt: the key is the fulfilment id plus the attempt number.
 */
export async function releaseShippingSubsidies(now = new Date()) {
  const rows = await sql()<
    {
      id: string;
      orderId: string;
      makerId: string;
      amountCents: number;
      attempts: number;
      stripeAccountId: string | null;
      chargesEnabled: boolean;
    }[]
  >`
    select f.id, f.order_id, f.maker_id, f.shipping_subsidy_due_cents as amount_cents,
      f.shipping_subsidy_attempts as attempts, m.stripe_account_id, m.stripe_charges_enabled as charges_enabled
    from public.fulfilments f join public.makers m on m.id = f.maker_id
    where f.shipping_subsidy_status in ('pending', 'failed') and f.shipping_subsidy_due_cents > 0
      and f.status in ('completed', 'refunded') and f.transfer_status in ('created', 'skipped')`;
  let released = 0;
  for (const f of rows) {
    if (!f.stripeAccountId || !f.chargesEnabled) continue;
    try {
      const t = await payments().createTransfer({
        amountCents: f.amountCents,
        destination: f.stripeAccountId,
        transferGroup: f.orderId,
        sourceTransaction: null,
        metadata: {
          order_id: f.orderId,
          fulfilment_id: f.id,
          maker_id: f.makerId,
          kind: 'shipping_subsidy',
        },
        // A new key per attempt: Stripe replays a failed request's error for 24 hours.
        idempotencyKey: `transfer:${f.id}:shipping:${f.attempts}`,
      });
      await sql()`
        update public.fulfilments set shipping_subsidy_status = 'created', shipping_subsidy_transfer_id = ${t.id}
        where id = ${f.id}`;
      await audit(
        'transfer.shipping_subsidy',
        { type: 'fulfilment', id: f.id },
        { amount: f.amountCents, transferId: t.id, at: now.toISOString() },
      );
      released++;
    } catch (err) {
      reportError(err, { fulfilmentId: f.id, where: 'releaseShippingSubsidies' });
      await sql()`
        update public.fulfilments set shipping_subsidy_status = 'failed',
          shipping_subsidy_attempts = shipping_subsidy_attempts + 1
        where id = ${f.id}`;
      await audit(
        'transfer.shipping_subsidy_failed',
        { type: 'fulfilment', id: f.id },
        { error: String(err) },
      );
    }
  }
  if (rows.length) log.info({ released, due: rows.length }, 'shipping subsidies released');
  return released;
}

/** Mirrors a Stripe payout from a maker's connected account into `payouts`. */
export async function upsertPayout(
  accountId: string,
  payout: {
    id: string;
    amount: number;
    arrivalDate: Date | null;
    status: string;
    failureMessage?: string | null;
  },
): Promise<{ makerId: string; isNew: boolean } | null> {
  const [maker] = await sql()<{ id: string }[]>`
    select id from public.makers where stripe_account_id = ${accountId}`;
  if (!maker) return null;
  // Orders released since the previous payout are the ones this payout carries.
  const [prev] = await sql()<{ createdAt: Date }[]>`
    select created_at from public.payouts where maker_id = ${maker.id} and stripe_payout_id <> ${payout.id}
    order by created_at desc limit 1`;
  const [counts] = await sql()<{ n: number; sales: number; fees: number }[]>`
    select count(*)::int as n, coalesce(sum(subtotal_cents + shipping_cents), 0)::int as sales,
      coalesce(sum(platform_commission_cents + processing_fee_cents), 0)::int as fees
    from public.fulfilments where maker_id = ${maker.id} and transfer_released_at is not null
      and transfer_released_at > ${prev?.createdAt ?? new Date(0)}`;
  const rows = await sql()<{ inserted: boolean }[]>`
    insert into public.payouts (maker_id, stripe_payout_id, amount_cents, arrival_date, status, order_count,
      sales_cents, fees_cents, failure_message)
    values (${maker.id}, ${payout.id}, ${payout.amount}, ${payout.arrivalDate}, ${payout.status},
      ${counts!.n}, ${counts!.sales}, ${counts!.fees}, ${payout.failureMessage ?? null})
    on conflict (stripe_payout_id) do update set status = excluded.status, amount_cents = excluded.amount_cents,
      arrival_date = excluded.arrival_date, failure_message = excluded.failure_message, updated_at = now()
    returning (xmax = 0) as inserted`;
  return { makerId: maker.id, isNew: Boolean(rows[0]?.inserted) };
}
