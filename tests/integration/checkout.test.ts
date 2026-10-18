import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, sql } from '@/lib/db';
import { mockStripe } from '@/lib/payments/mock';
import { handleStripeEvent } from '@/lib/services/webhook';
import { POST as webhookPOST } from '@/app/api/webhooks/stripe/route';
import { buyAndPay, pickVariant } from './helpers';

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
      transferStatus: string;
      stripeTransferId: string | null;
      estimatedDispatchDate: Date;
    }[]
  >`
    select maker_id, subtotal_cents, shipping_cents, platform_commission_cents, seller_net_cents, transfer_status, stripe_transfer_id, estimated_dispatch_date
    from public.fulfilments where order_id = ${orderId}`;
  const items = await sql()<
    { platformCommissionCents: number; lineTotalCents: number; sellerNetCents: number }[]
  >`
    select platform_commission_cents, line_total_cents, seller_net_cents from public.order_items where order_id = ${orderId}`;
  return { order: order!, fulfilments, items };
}

describe('checkout → webhook (ready-to-ship)', () => {
  it('marks the order paid, decrements stock, records commission, transfers to the maker and emails both sides', async () => {
    const { product, variantId, stock } = await pickVariant(
      (p) => p.productType === 'ready_to_ship',
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
    expect(fulfilments[0]!.transferStatus).toBe('created');
    expect(fulfilments[0]!.sellerNetCents).toBe(
      product.priceCents - items[0]!.platformCommissionCents + fulfilments[0]!.shippingCents,
    );

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
  it('creates one buyer order with a separate fulfilment and transfer per maker', async () => {
    const a = await pickVariant(
      (p) => p.productType === 'ready_to_ship' && p.maker.slug === 'marlowe-atelier',
    );
    const b = await pickVariant(
      (p) => p.productType !== 'one_of_one' && p.maker.slug === 'saltbush-studio',
    );
    const c = await pickVariant(
      (p) => p.productType !== 'one_of_one' && p.maker.slug === 'norwood-noir',
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
    expect(fulfilments.every((f) => f.transferStatus === 'created' && f.stripeTransferId)).toBe(
      true,
    );
    const nets = fulfilments.reduce((s, f) => s + f.sellerNetCents, 0);
    expect(nets + order.platformFeeTotalCents).toBe(order.totalCents);
    expect(order.shippingTotalCents).toBe(fulfilments.reduce((s, f) => s + f.shippingCents, 0));
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
    const transfers =
      await sql()`select id from public.fulfilments where order_id = ${orderId} and stripe_transfer_id is not null`;
    expect(transfers).toHaveLength(1);
  });

  it('never marks an order paid when Stripe reports it unpaid', async () => {
    const { randomUUID } = await import('node:crypto');
    const { addToCart } = await import('@/lib/services/cart');
    const { createCheckout } = await import('@/lib/services/checkout');
    const { product, variantId } = await pickVariant((p) => p.productType === 'ready_to_ship', 5);
    const sessionId = randomUUID();
    await addToCart({ sessionId, userId: null, productId: product.id, variantId, quantity: 1 });
    const { orderId } = await createCheckout({
      sessionId,
      userId: null,
      email: 'unpaid@buyer.test',
      returnsAck: true,
    });
    const [o] = await sql()<
      { cs: string }[]
    >`select stripe_checkout_session_id as cs from public.orders where id = ${orderId}`;
    // Forged "completed" event without payment: handler re-fetches the session and sees it unpaid.
    await handleStripeEvent(
      mockStripe.event('checkout.session.completed', {
        id: o!.cs,
        payment_status: 'paid',
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
    const { orderId } = await buyAndPay([{ productId: product.id, variantId }]);
    const [item] = await sql()<
      { id: string; lineTotalCents: number }[]
    >`select id, line_total_cents from public.order_items where order_id = ${orderId}`;
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
