import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, sql } from '@/lib/db';
import { mockStripe } from '@/lib/payments/mock';
import { handleStripeEvent } from '@/lib/services/webhook';
import { POST as webhookPOST } from '@/app/api/webhooks/stripe/route';
import { MAKERS, buyAndPay, pickVariant } from './helpers';

afterAll(closeDb);

async function orderState(orderId: string) {
  const [order] = await sql()<
    {
      status: string;
      totalCents: number;
      subtotalCents: number;
      shippingTotalCents: number;
      platformFeeTotalCents: number;
      buyerEmail: string;
    }[]
  >`
    select status, total_cents, subtotal_cents, shipping_total_cents, platform_fee_total_cents, buyer_email from public.orders where id = ${orderId}`;
  const fulfilments = await sql()<
    {
      makerId: string;
      subtotalCents: number;
      shippingCents: number;
      platformCommissionCents: number;
      sellerNetCents: number;
      processingFeeCents: number;
      commissionPctApplied: string;
      transferStatus: string;
      stripeTransferId: string | null;
      estimatedDispatchDate: Date;
    }[]
  >`
    select maker_id, subtotal_cents, shipping_cents, platform_commission_cents, seller_net_cents, processing_fee_cents,
      commission_pct_applied, transfer_status, stripe_transfer_id, estimated_dispatch_date
    from public.fulfilments where order_id = ${orderId}`;
  const items = await sql()<
    { platformCommissionCents: number; lineTotalCents: number; sellerNetCents: number }[]
  >`
    select platform_commission_cents, line_total_cents, seller_net_cents from public.order_items where order_id = ${orderId}`;
  return { order: order!, fulfilments, items };
}

describe('checkout → webhook (ready-to-ship)', () => {
  it('marks the order paid, decrements stock, records commission and fees, holds the maker’s money and emails both sides', async () => {
    // Halde Studio is a founding maker (0%); this checks the standard rate.
    const { product, variantId, stock } = await pickVariant(
      (p) => p.productType === 'ready_to_ship' && p.maker.slug !== 'halde-studio',
    );
    const { orderId, outcome } = await buyAndPay(
      [{ productId: product.id, variantId }],
      'rts@buyer.test',
    );
    expect(outcome).toBe('processed');

    const { order, fulfilments, items } = await orderState(orderId);
    expect(order.status).toBe('paid');
    expect(order.subtotalCents).toBe(product.priceCents);
    expect(order.totalCents).toBe(order.subtotalCents + order.shippingTotalCents);
    expect(items[0]!.platformCommissionCents).toBe(Math.round(product.priceCents * 0.15));
    expect(fulfilments).toHaveLength(1);
    const f = fulfilments[0]!;
    expect(Number(f.commissionPctApplied)).toBe(15);
    // Stripe's fee (mock: 1.75% + 30c of the charge) comes out of the maker's share.
    expect(f.processingFeeCents).toBe(Math.round(order.totalCents * 0.0175) + 30);
    expect(f.sellerNetCents).toBe(
      product.priceCents -
        items[0]!.platformCommissionCents +
        f.shippingCents -
        f.processingFeeCents,
    );
    // Nothing is transferred until the order is delivered.
    expect(f.transferStatus).toBe('pending');
    expect(f.stripeTransferId).toBeNull();

    const [v] = await sql()<
      { stockQuantity: number }[]
    >`select stock_quantity from public.product_variants where id = ${variantId}`;
    expect(v!.stockQuantity).toBe(stock - 1);

    const mail = await sql()<
      { template: string }[]
    >`select template from public.email_outbox where related_entity_id = ${orderId}`;
    expect(mail.map((m) => m.template).sort()).toEqual(['maker_new_order', 'order_confirmation']);
  });
});

describe('checkout → webhook (made-to-order)', () => {
  it('pays the order and schedules dispatch after the production lead time', async () => {
    const { product, variantId } = await pickVariant((p) => p.productType === 'made_to_order');
    const { orderId } = await buyAndPay([{ productId: product.id, variantId }], 'mto@buyer.test');
    const { order, fulfilments } = await orderState(orderId);
    expect(order.status).toBe('paid');
    const days =
      (new Date(fulfilments[0]!.estimatedDispatchDate).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThanOrEqual(product.leadTimeDays! - 1);
  });
});

describe('multi-maker cart', () => {
  it('creates one buyer order with a separate fulfilment per maker and splits the card fee', async () => {
    const a = await pickVariant(
      (p) => p.productType === 'ready_to_ship' && p.maker.slug === MAKERS[0]!.slug,
    );
    const b = await pickVariant(
      (p) => p.productType !== 'one_of_one' && p.maker.slug === MAKERS[1]!.slug,
    );
    const c = await pickVariant(
      (p) => p.productType !== 'one_of_one' && p.maker.slug === MAKERS[2]!.slug,
    );
    const { orderId } = await buyAndPay([
      { productId: a.product.id, variantId: a.variantId },
      { productId: b.product.id, variantId: b.variantId },
      { productId: c.product.id, variantId: c.variantId },
    ]);
    const { order, fulfilments } = await orderState(orderId);
    const orders = await sql()`select id from public.orders where id = ${orderId}`;
    expect(orders).toHaveLength(1);
    expect(fulfilments).toHaveLength(3);
    expect(new Set(fulfilments.map((f) => f.makerId))).toEqual(
      new Set([a.product.maker.id, b.product.maker.id, c.product.maker.id]),
    );
    expect(fulfilments.every((f) => f.transferStatus === 'pending' && !f.stripeTransferId)).toBe(
      true,
    );
    const nets = fulfilments.reduce((s, f) => s + f.sellerNetCents, 0);
    const fees = fulfilments.reduce((s, f) => s + f.processingFeeCents, 0);
    expect(fees).toBe(Math.round(order.totalCents * 0.0175) + 30);
    // The buyer pays less shipping than the makers are paid when One Off's shipping offer
    // applies; One Off covers the difference (shipping_subsidy_cents).
    const covered = await sql()<{ buyer: number; subsidy: number }[]>`
      select coalesce(sum(buyer_shipping_cents), 0)::int as buyer, coalesce(sum(shipping_subsidy_cents), 0)::int as subsidy
      from public.fulfilments where order_id = ${orderId}`;
    expect(nets + order.platformFeeTotalCents + fees).toBe(order.totalCents + covered[0]!.subsidy);
    expect(order.shippingTotalCents).toBe(covered[0]!.buyer);
    expect(order.shippingTotalCents + covered[0]!.subsidy).toBe(
      fulfilments.reduce((s, f) => s + f.shippingCents, 0),
    );
  });
});

describe('webhook security & idempotency', () => {
  it('rejects requests with an invalid signature', async () => {
    const event = mockStripe.event('checkout.session.completed', { id: 'cs_mock_nope' });
    const { payload } = mockStripe.signEvent(event);
    const bad = mockStripe.signEvent(event, 'whsec_wrong_secret').header;
    const res = await webhookPOST(
      new Request('http://test/api/webhooks/stripe', {
        method: 'POST',
        body: payload,
        headers: { 'stripe-signature': bad },
      }),
    );
    expect(res.status).toBe(400);
    const missing = await webhookPOST(
      new Request('http://test/api/webhooks/stripe', { method: 'POST', body: payload }),
    );
    expect(missing.status).toBe(400);
  });

  it('accepts a correctly signed event through the route and ignores replays', async () => {
    const { product, variantId } = await pickVariant((p) => p.productType === 'ready_to_ship', 3);
    const { orderId, event } = await buyAndPay([{ productId: product.id, variantId }]);
    const [{ stock: before }] =
      (await sql()`select stock_quantity as stock from public.product_variants where id = ${variantId}`) as unknown as [
        { stock: number },
      ];

    // Replay the exact same event via the HTTP route with a valid signature.
    const { payload, header } = mockStripe.signEvent(event);
    const res = await webhookPOST(
      new Request('http://test/api/webhooks/stripe', {
        method: 'POST',
        body: payload,
        headers: { 'stripe-signature': header },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ outcome: 'duplicate' });
    expect(await handleStripeEvent(event as never)).toBe('duplicate');

    const [{ stock: after }] =
      (await sql()`select stock_quantity as stock from public.product_variants where id = ${variantId}`) as unknown as [
        { stock: number },
      ];
    expect(after).toBe(before);
    const [fee] = await sql()<{ n: number }[]>`
      select count(*)::int as n from public.fulfilments where order_id = ${orderId} and processing_fee_cents > 0`;
    expect(fee!.n).toBe(1);
  });

  it('never marks an order paid when Stripe reports it unpaid', async () => {
    const { randomUUID } = await import('node:crypto');
    const { addToCart } = await import('@/lib/services/cart');
    const checkout = await import('@/lib/services/checkout');
    const { TEST_ADDRESS } = await import('./helpers');
    const { product, variantId } = await pickVariant((p) => p.productType === 'ready_to_ship', 5);
    const owner = { sessionId: randomUUID(), userId: null };
    await addToCart({ ...owner, productId: product.id, variantId, quantity: 1 });
    const { orderId } = await checkout.openCheckout(owner);
    await checkout.saveCheckoutDetails(owner, { email: 'unpaid@buyer.test', phone: '' });
    await checkout.saveCheckoutDelivery(owner, { address: TEST_ADDRESS, speeds: {} });
    const { paymentIntentId } = await checkout.preparePayment(owner);
    // Forged "succeeded" event without payment: the handler re-fetches the intent and sees it unpaid.
    await handleStripeEvent(
      mockStripe.event('payment_intent.succeeded', {
        id: paymentIntentId,
        status: 'succeeded',
      }) as never,
    );
    const [after] = await sql()<
      { status: string }[]
    >`select status from public.orders where id = ${orderId}`;
    expect(after!.status).toBe('pending');
  });
});

describe('refunds', () => {
  it('partially refunds an item, reverses the maker share and updates order status', async () => {
    const { refundOrderItem } = await import('@/lib/services/webhook');
    const { product, variantId } = await pickVariant((p) => p.productType === 'ready_to_ship', 6);
    const { releaseDueTransfers } = await import('@/lib/services/payouts');
    const { orderId } = await buyAndPay([{ productId: product.id, variantId }]);
    const [item] = await sql()<
      { id: string; lineTotalCents: number }[]
    >`select id, line_total_cents from public.order_items where order_id = ${orderId}`;
    // Delivered four days ago, so the maker has been paid.
    await sql()`update public.fulfilments set status = 'delivered', shipped_at = now() - interval '6 days',
      delivered_at = now() - interval '4 days' where order_id = ${orderId}`;
    await releaseDueTransfers();
    await refundOrderItem({
      orderItemId: item!.id,
      amountCents: 5000,
      reason: 'test',
      actorUserId: null,
    });
    const [o] = await sql()<
      { status: string; refundedCents: number }[]
    >`select status, refunded_cents from public.orders where id = ${orderId}`;
    expect(o).toEqual({ status: 'partially_refunded', refundedCents: 5000 });
    const reversals =
      await sql()`select id from public.mock_stripe_objects where type = 'transfer_reversal'`;
    expect(reversals.length).toBeGreaterThan(0);
    await expect(
      refundOrderItem({
        orderItemId: item!.id,
        amountCents: item!.lineTotalCents,
        reason: 'too much',
        actorUserId: null,
      }),
    ).rejects.toThrow(/Refund must/);
  });
});
