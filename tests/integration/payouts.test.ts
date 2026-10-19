import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, sql } from '@/lib/db';
import { autoMarkDelivered, releaseDueTransfers } from '@/lib/services/payouts';
import { TERMS } from '@/lib/studio/terms';
import { MAKERS, buyAndPay, pickVariant } from './helpers';

afterAll(closeDb);

const DAY = 86_400_000;

async function fulfilment(orderId: string) {
  const [f] = await sql()<
    {
      id: string;
      status: string;
      stripeTransferId: string | null;
      sellerNetCents: number;
      commissionPctApplied: string;
      platformCommissionCents: number;
      subtotalCents: number;
    }[]
  >`select id, status, stripe_transfer_id, seller_net_cents, commission_pct_applied, platform_commission_cents,
      subtotal_cents from public.fulfilments where order_id = ${orderId}`;
  return f!;
}

async function deliveredOrder(skip: number, daysAgo: number) {
  const { product, variantId } = await pickVariant((p) => p.productType === 'ready_to_ship', skip);
  const { orderId } = await buyAndPay([{ productId: product.id, variantId }]);
  const at = new Date(Date.now() - daysAgo * DAY);
  await sql()`update public.fulfilments set status = 'delivered', shipped_at = ${new Date(at.getTime() - 2 * DAY)},
    delivered_at = ${at} where order_id = ${orderId}`;
  return { orderId, product };
}

describe('releasing makers’ money', () => {
  it(`transfers ${TERMS.releaseDaysAfterDelivery} days after delivery, and not before`, async () => {
    const early = await deliveredOrder(7, TERMS.releaseDaysAfterDelivery - 1);
    const due = await deliveredOrder(8, TERMS.releaseDaysAfterDelivery + 0.1);
    await releaseDueTransfers();
    expect((await fulfilment(early.orderId)).stripeTransferId).toBeNull();
    expect((await fulfilment(early.orderId)).status).toBe('delivered');
    const f = await fulfilment(due.orderId);
    expect(f.status).toBe('completed');
    expect(f.stripeTransferId).toMatch(/^tr_mock_/);
    const [t] = await sql()<{ amount: number }[]>`
      select (data->>'amountCents')::int as amount from public.mock_stripe_objects where id = ${f.stripeTransferId}`;
    expect(t!.amount).toBe(f.sellerNetCents);
    // Running again never pays twice.
    await releaseDueTransfers();
    const [n] = await sql()<{ n: number }[]>`
      select count(*)::int as n from public.mock_stripe_objects where type = 'transfer'
      and data->'metadata'->>'fulfilment_id' = ${f.id}`;
    expect(n!.n).toBe(1);
  });

  it('holds the money while a fault claim is open', async () => {
    const { orderId } = await deliveredOrder(9, TERMS.releaseDaysAfterDelivery + 1);
    const [item] = await sql()<{ id: string; makerId: string; buyerId: string }[]>`
      select oi.id, oi.maker_id, o.buyer_user_id as buyer_id from public.order_items oi
      join public.orders o on o.id = oi.order_id where oi.order_id = ${orderId}`;
    const [buyer] = await sql()<
      { id: string }[]
    >`select id from public.users where role = 'buyer' limit 1`;
    await sql()`
      insert into public.return_claims (order_id, order_item_id, buyer_id, seller_id, reason, details, photos, respond_by)
      values (${orderId}, ${item!.id}, ${item!.buyerId ?? buyer!.id}, ${item!.makerId}, 'faulty',
        'The side seam has come apart after one wear.', ${['claims/test.jpg']}, now() + interval '2 days')`;
    const result = await releaseDueTransfers();
    expect(result.held).toBeGreaterThan(0);
    expect((await fulfilment(orderId)).stripeTransferId).toBeNull();
  });

  it(`marks shipped orders delivered after ${TERMS.autoDeliveredDaysAfterShip} days without a delivery event`, async () => {
    const { product, variantId } = await pickVariant((p) => p.productType === 'ready_to_ship', 10);
    const { orderId } = await buyAndPay([{ productId: product.id, variantId }]);
    await sql()`update public.fulfilments set status = 'shipped',
      shipped_at = now() - make_interval(days => ${TERMS.autoDeliveredDaysAfterShip + 1}) where order_id = ${orderId}`;
    expect(await autoMarkDelivered()).toBeGreaterThan(0);
    expect((await fulfilment(orderId)).status).toBe('delivered');
  });
});

describe('founding commission', () => {
  it(`charges ${TERMS.foundingCommissionPct}% while founding and ${TERMS.standardCommissionPct}% after`, async () => {
    const maker = MAKERS[4]!;
    await sql()`update public.makers set founding_until = now() + interval '30 days' where id = ${maker.id}`;
    try {
      const a = await pickVariant(
        (p) => p.productType === 'ready_to_ship' && p.maker.slug === maker.slug,
      );
      const founding = await buyAndPay([{ productId: a.product.id, variantId: a.variantId }]);
      const f1 = await fulfilment(founding.orderId);
      expect(Number(f1.commissionPctApplied)).toBe(TERMS.foundingCommissionPct);
      expect(f1.platformCommissionCents).toBe(0);

      await sql()`update public.makers set founding_until = now() - interval '1 minute' where id = ${maker.id}`;
      const after = await buyAndPay([{ productId: a.product.id, variantId: a.variantId }]);
      const f2 = await fulfilment(after.orderId);
      expect(Number(f2.commissionPctApplied)).toBe(TERMS.standardCommissionPct);
      expect(f2.platformCommissionCents).toBe(Math.round(f2.subtotalCents * 0.15));
      // The rate stored on the earlier order never changes.
      expect(Number((await fulfilment(founding.orderId)).commissionPctApplied)).toBe(0);
    } finally {
      await sql()`update public.makers set founding_until = null where id = ${maker.id}`;
    }
  });
});
