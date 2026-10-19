import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, sql } from '@/lib/db';
import { payments } from '@/lib/payments';
import { addToCart } from '@/lib/services/cart';
import {
  checkoutView,
  openCheckout,
  preparePayment,
  saveCheckoutDelivery,
  saveCheckoutDetails,
} from '@/lib/services/checkout';
import { PRODUCTS, TEST_ADDRESS, buyAndPay } from './helpers';

afterAll(closeDb);

/** An in-stock variant of a seeded product, by type, from a maker not already used. */
async function variantOf(type: string, notMakers: string[] = []) {
  for (const p of PRODUCTS.filter(
    (x) => x.productType === type && !notMakers.includes(x.maker.id),
  )) {
    const [v] = await sql()<{ id: string }[]>`
      select v.id from public.product_variants v join public.products pr on pr.id = v.product_id
      where v.product_id = ${p.id} and v.is_active and v.stock_quantity >= 1 and pr.status = 'approved'
        and not ('preview-only' = any(pr.tags)) limit 1`;
    if (v) return { productId: p.id, variantId: v.id, makerId: p.maker.id, title: p.title };
  }
  throw new Error(`No ${type} variant`);
}

describe('checkout', () => {
  it('a guest with 3 pieces from 3 makers pays once: 1 order, 3 shipments, one-of-one sold, account made', async () => {
    const one = await variantOf('one_of_one');
    const ready = await variantOf('ready_to_ship', [one.makerId]);
    const mto = await variantOf('made_to_order', [one.makerId, ready.makerId]);
    const email = `guest.${Date.now()}@buyer.test`;
    const { orderId, paymentIntentId } = await buyAndPay([one, ready, mto], email, null, {
      saveDetails: true,
    });

    const [order] = await sql()<
      {
        status: string;
        buyerUserId: string | null;
        accountCreated: boolean;
        transferGroup: string;
      }[]
    >`select status, buyer_user_id, account_created, transfer_group from public.orders where id = ${orderId}`;
    expect(order!.status).toBe('paid');
    const shipments = await sql()<{ payoutStatus: string }[]>`
      select payout_status from public.fulfilments where order_id = ${orderId}`;
    expect(shipments).toHaveLength(3);
    expect(shipments.every((s) => s.payoutStatus === 'held')).toBe(true);

    const pi = await payments().retrievePaymentIntent(paymentIntentId);
    expect((pi as unknown as { transferGroup: string }).transferGroup).toBe(orderId);
    expect(order!.transferGroup).toBe(orderId);

    const [sold] = await sql()<{ stock: number }[]>`
      select stock_quantity as stock from public.product_variants where id = ${one.variantId}`;
    expect(sold!.stock).toBe(0);

    expect(order!.accountCreated).toBe(true);
    const [user] = await sql()<
      { id: string }[]
    >`select id from public.users where email = ${email}`;
    expect(order!.buyerUserId).toBe(user!.id);
    const [mail] = await sql()<{ n: number }[]>`
      select count(*)::int as n from public.email_outbox where to_email = ${email} and template = 'account_ready'`;
    expect(mail!.n).toBe(1);
    const [prefs] = await sql()<{ addresses: Array<{ suburb: string }> }[]>`
      select addresses from public.customer_prefs where user_id = ${user!.id}`;
    expect(prefs!.addresses[0]!.suburb).toBe('Fitzroy');
  });

  it('holds a one-of-one for the buyer paying; the next buyer sees it’s taken until the hold ends', async () => {
    const one = await variantOf('one_of_one');
    const a = { sessionId: randomUUID(), userId: null };
    const b = { sessionId: randomUUID(), userId: null };
    for (const o of [a, b]) {
      await addToCart({ ...o, productId: one.productId, variantId: one.variantId, quantity: 1 });
      await openCheckout(o);
      await saveCheckoutDetails(o, { email: `${o.sessionId.slice(0, 6)}@buyer.test`, phone: '' });
      await saveCheckoutDelivery(o, { address: TEST_ADDRESS, speeds: {} });
    }
    await preparePayment(a);
    const viewB = await checkoutView(b);
    expect(viewB.hasHeld).toBe(true);
    await expect(preparePayment(b)).rejects.toThrow(/Someone’s checking out with this piece/);

    // Ten minutes later the hold has lapsed.
    await sql()`update public.reservations set expires_at = now() - interval '1 second'
      where variant_id = ${one.variantId}`;
    expect((await checkoutView(b)).hasHeld).toBe(false);
    await expect(preparePayment(b)).resolves.toMatchObject({ orderNumber: viewB.orderNumber });
    await sql()`delete from public.reservations where variant_id = ${one.variantId}`;
  });

  it('charges same-state delivery for a VIC maker and interstate for a WA maker', async () => {
    const piece = await variantOf('ready_to_ship');
    const o = { sessionId: randomUUID(), userId: null };
    await addToCart({ ...o, productId: piece.productId, variantId: piece.variantId, quantity: 1 });
    await openCheckout(o);
    await saveCheckoutDetails(o, { email: 'zones@buyer.test', phone: '' });
    await saveCheckoutDelivery(o, { address: TEST_ADDRESS, speeds: {} });
    const vic = await checkoutView(o);
    expect(vic.parcels[0]!.zone).toBe('sameState');

    const [{ state }] =
      (await sql()`select state from public.makers where id = ${piece.makerId}`) as unknown as [
        { state: string },
      ];
    await sql()`update public.makers set state = 'WA' where id = ${piece.makerId}`;
    try {
      await saveCheckoutDelivery(o, { address: TEST_ADDRESS, speeds: {} });
      const wa = await checkoutView(o);
      expect(wa.parcels[0]!.zone).toBe('interstate');
      expect(wa.parcels[0]!.options.standard.cents).toBeGreaterThanOrEqual(
        vic.parcels[0]!.options.standard.cents,
      );
    } finally {
      await sql()`update public.makers set state = ${state} where id = ${piece.makerId}`;
    }
  });
});
