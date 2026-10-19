import { audit } from '@/lib/audit';
import { sql } from '@/lib/db';
import { log, reportError } from '@/lib/log';
import { payments } from '@/lib/payments';
import { TERMS } from '@/lib/studio/terms';

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

/** Marks a shipped order delivered (carrier event, buyer confirmation, or the timeout). */
export async function markDelivered(
  fulfilmentId: string,
  source: 'carrier' | 'buyer' | 'auto' | 'admin',
  at = new Date(),
): Promise<boolean> {
  const updated = await sql()<{ id: string; makerId: string }[]>`
    update public.fulfilments set status = 'delivered', delivered_at = ${at}, delivery_source = ${source}
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
  const cutoff = new Date(now.getTime() - TERMS.releaseDaysAfterDelivery * DAY);
  const rows = await sql()<
    {
      id: string;
      orderId: string;
      makerId: string;
      sellerNetCents: number;
      refundedShare: number;
      stripeAccountId: string | null;
      chargesEnabled: boolean;
      chargeId: string | null;
      held: boolean;
    }[]
  >`
    select f.id, f.order_id, f.maker_id, f.seller_net_cents, m.stripe_account_id,
      m.stripe_charges_enabled as charges_enabled, o.stripe_charge_id as charge_id,
      coalesce((select sum(round(oi.refunded_cents::numeric * oi.seller_net_cents / oi.line_total_cents))
                from public.order_items oi where oi.fulfilment_id = f.id), 0)::int as refunded_share,
      exists (select 1 from public.return_claims c join public.order_items oi on oi.id = c.order_item_id
              where oi.fulfilment_id = f.id and c.status in ${sql().unsafe(ACTIVE_CLAIM)}) as held
    from public.fulfilments f
    join public.makers m on m.id = f.maker_id
    join public.orders o on o.id = f.order_id
    where f.status = 'delivered' and f.delivered_at <= ${cutoff}
      and f.stripe_transfer_id is null and f.transfer_status in ('pending', 'failed')
      and o.status in ('paid', 'partially_refunded')`;

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
    const amount = f.sellerNetCents - f.refundedShare;
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
          transfer_status = ${transferId ? 'created' : 'skipped'}, transfer_released_at = ${now}
        where id = ${f.id}`;
      await sql()`
        update public.order_items set fulfilment_status = 'completed'
        where fulfilment_id = ${f.id} and fulfilment_status = 'delivered'`;
      await audit('transfer.created', { type: 'fulfilment', id: f.id }, { amount, transferId });
      result.released++;
    } catch (err) {
      reportError(err, { fulfilmentId: f.id, where: 'releaseDueTransfers' });
      await sql()`update public.fulfilments set transfer_status = 'failed' where id = ${f.id}`;
      await audit('transfer.failed', { type: 'fulfilment', id: f.id }, { error: String(err) });
    }
  }
  log.info(result, 'transfers released');
  return result;
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
