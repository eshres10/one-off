import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { closeDb, sql } from '@/lib/db';
import { payments } from '@/lib/payments';
import { mockStripe } from '@/lib/payments/mock';
import { addToCart } from '@/lib/services/cart';
import { expressCheckout, openCheckout } from '@/lib/services/checkout';
import { createClaim, resolveClaim } from '@/lib/services/claims';
import { shipByReminders, weeklySummaries } from '@/lib/services/notifications';
import { markDelivered, releaseDueTransfers } from '@/lib/services/payouts';
import { handleStripeEvent } from '@/lib/services/webhook';
import { TERMS } from '@/lib/studio/terms';
import { ADMIN, TEST_ADDRESS, buyAndPay, buyer, pickVariant } from './helpers';

afterAll(closeDb);

const DAY = 86_400_000;
const admin = { id: ADMIN.id, role: 'admin' as const, makerId: null };

/** A paid order for buyer `i`, shipped and then delivered `daysAgo` days ago. */
async function delivered(type: string, skip: number, daysAgo: number, i = 2) {
  const b = buyer(i);
  const { product, variantId } = await pickVariant((p) => p.productType === type, skip);
  const { orderId } = await buyAndPay([{ productId: product.id, variantId }], b.email, b.id);
  const [f] = await sql()<{ id: string }[]>`
    update public.fulfilments set status = 'shipped', shipped_at = now() - interval '5 days'
    where order_id = ${orderId} returning id`;
  await markDelivered(f!.id, 'buyer', new Date(Date.now() - daysAgo * DAY));
  const [item] = await sql()<{ id: string }[]>`
    select id from public.order_items where order_id = ${orderId}`;
  return { orderId, fulfilmentId: f!.id, itemId: item!.id, buyer: b, product };
}

const fulfilment = async (id: string) =>
  (
    await sql()<
      {
        status: string;
        payoutStatus: string;
        payoutDueAt: Date | null;
        deliveredAt: Date;
        stripeTransferId: string | null;
        makerId: string;
      }[]
    >`select status, payout_status, payout_due_at, delivered_at, stripe_transfer_id, maker_id
      from public.fulfilments where id = ${id}`
  )[0]!;

describe('express checkout', () => {
  it('goes from the bag to paid without the Details step', async () => {
    const { product, variantId } = await pickVariant((p) => p.productType === 'ready_to_ship', 3);
    const sessionId = randomUUID();
    await addToCart({ sessionId, userId: null, productId: product.id, variantId, quantity: 1 });
    const owner = { sessionId, userId: null, email: null };
    const opened = await openCheckout(owner);
    const prepared = await expressCheckout(owner, {
      email: `express.${Date.now()}@buyer.test`,
      phone: '0400 111 222',
      address: TEST_ADDRESS,
    });
    await mockStripe.succeedPaymentIntent(prepared.paymentIntentId, 'card');
    await handleStripeEvent(
      mockStripe.event('payment_intent.succeeded', {
        id: prepared.paymentIntentId,
        object: 'payment_intent',
      }) as never,
    );
    const [o] = await sql()<{ status: string; shippingAddress: { city: string } }[]>`
      select status, shipping_address from public.orders where id = ${opened.orderId}`;
    expect(o!.status).toBe('paid');
    expect(o!.shippingAddress.city).toBe(TEST_ADDRESS.suburb);
  });
});

describe('payouts after delivery', () => {
  it(`schedules the payout for delivered + ${TERMS.releaseDaysAfterDelivery} days and pays nothing before`, async () => {
    const d = await delivered('ready_to_ship', 11, 1);
    const f = await fulfilment(d.fulfilmentId);
    expect(f.payoutStatus).toBe('scheduled');
    expect(f.payoutDueAt!.getTime() - f.deliveredAt.getTime()).toBe(
      TERMS.releaseDaysAfterDelivery * DAY,
    );
    await releaseDueTransfers();
    expect((await fulfilment(d.fulfilmentId)).stripeTransferId).toBeNull();
    // On the due date it goes.
    await releaseDueTransfers(new Date(f.payoutDueAt!.getTime() + 60_000));
    const after = await fulfilment(d.fulfilmentId);
    expect(after.stripeTransferId).toMatch(/^tr_mock_/);
    expect(after.payoutStatus).toBe('paid');
  });
});

describe('cases and payouts', () => {
  it('a case opened 1 day after delivery pauses that payout until it is resolved', async () => {
    const d = await delivered('ready_to_ship', 12, 1);
    const { claimId, caseNumber } = await createClaim(d.buyer, {
      orderItemId: d.itemId,
      reason: 'other',
      details: 'The buttons are a different colour to the photos.',
      photos: [],
      outcome: 'replace',
    });
    expect(caseNumber).toMatch(/^OO-C-\d+$/);
    expect((await fulfilment(d.fulfilmentId)).payoutStatus).toBe('paused');
    // Even well past the due date, nothing is paid while paused.
    await releaseDueTransfers(new Date(Date.now() + 10 * DAY));
    expect((await fulfilment(d.fulfilmentId)).stripeTransferId).toBeNull();
    // The report is in the conversation with the maker.
    const [msg] = await sql()<{ n: number }[]>`
      select count(*)::int as n from public.messages m join public.return_claims c on c.thread_id = m.thread_id
      where c.id = ${claimId} and m.kind = 'system' and m.body like ${`%${caseNumber}%`}`;
    expect(msg!.n).toBe(1);

    await resolveClaim(admin, claimId, { resolution: 'replace', internalNote: 'Maker agreed.' });
    expect((await fulfilment(d.fulfilmentId)).payoutStatus).toBe('scheduled');
    const [note] = await sql()<{ n: number }[]>`
      select count(*)::int as n from public.case_notes where claim_id = ${claimId}`;
    expect(note!.n).toBe(1);
  });

  it('a refund after the maker was paid reverses the transfer', async () => {
    const d = await delivered('ready_to_ship', 13, TERMS.releaseDaysAfterDelivery + 1);
    await releaseDueTransfers();
    const paid = await fulfilment(d.fulfilmentId);
    expect(paid.stripeTransferId).toMatch(/^tr_mock_/);
    const { claimId } = await createClaim(d.buyer, {
      orderItemId: d.itemId,
      reason: 'other',
      details: 'The hem is coming down along one side already.',
      photos: [],
      outcome: 'refund',
    });
    // Reported after the payout went: nothing to pause.
    expect((await fulfilment(d.fulfilmentId)).payoutStatus).toBe('paid');
    await resolveClaim(admin, claimId, { resolution: 'refund' });
    const [rev] = await sql()<{ n: number }[]>`
      select count(*)::int as n from public.mock_stripe_objects
      where type = 'transfer_reversal' and data->>'transferId' = ${paid.stripeTransferId}`;
    expect(rev!.n).toBe(1);
    expect((await fulfilment(d.fulfilmentId)).payoutStatus).toBe('reversed');
  });

  it('when the reversal fails, the amount comes off the maker’s next payout', async () => {
    const d = await delivered('ready_to_ship', 14, TERMS.releaseDaysAfterDelivery + 1);
    await releaseDueTransfers();
    const { claimId } = await createClaim(d.buyer, {
      orderItemId: d.itemId,
      reason: 'other',
      details: 'The zip broke the first time I wore it.',
      photos: [],
      outcome: 'refund',
    });
    const spy = vi
      .spyOn(payments(), 'reverseTransfer')
      .mockRejectedValueOnce(new Error('insufficient balance'));
    await resolveClaim(admin, claimId, { resolution: 'refund' });
    spy.mockRestore();
    const [adj] = await sql()<{ amountCents: number; makerId: string }[]>`
      select amount_cents, maker_id from public.maker_adjustments where claim_id = ${claimId}`;
    expect(adj!.amountCents).toBeGreaterThan(0);

    expect(adj!.makerId).toBe((await fulfilment(d.fulfilmentId)).makerId);
  });

  it('takes what a maker owes off their next payout', async () => {
    const next = await delivered('ready_to_ship', 18, TERMS.releaseDaysAfterDelivery + 1);
    const f = await fulfilment(next.fulfilmentId);
    const [adj] = await sql()<{ id: string }[]>`
      insert into public.maker_adjustments (maker_id, amount_cents, reason)
      values (${f.makerId}, 500, 'test: earlier refund') returning id`;
    const [net] = await sql()<{ sellerNetCents: number }[]>`
      select seller_net_cents from public.fulfilments where id = ${next.fulfilmentId}`;
    await releaseDueTransfers();
    const paid = await fulfilment(next.fulfilmentId);
    const [t] = await sql()<{ amount: number }[]>`
      select (data->>'amountCents')::int as amount from public.mock_stripe_objects where id = ${paid.stripeTransferId}`;
    expect(t!.amount).toBe(net!.sellerNetCents - 500);
    const [applied] = await sql()<{ appliedTo: string | null }[]>`
      select applied_to_fulfilment_id as applied_to from public.maker_adjustments where id = ${adj!.id}`;
    expect(applied!.appliedTo).toBe(next.fulfilmentId);
  });

  it('only offers "wasn’t made to my measurements" for made to order', async () => {
    const d = await delivered('ready_to_ship', 15, 1);
    await expect(
      createClaim(d.buyer, {
        orderItemId: d.itemId,
        reason: 'custom_fit',
        details: 'It does not match the measurements I gave.',
        photos: [],
        outcome: 'refund',
      }),
    ).rejects.toThrow(/wasn’t made to your measurements/);
  });

  it('isn’t available before delivery', async () => {
    const b = buyer(2);
    const { product, variantId } = await pickVariant((p) => p.productType === 'ready_to_ship', 16);
    const { orderId } = await buyAndPay([{ productId: product.id, variantId }], b.email, b.id);
    const [item] = await sql()<{ id: string }[]>`
      select id from public.order_items where order_id = ${orderId}`;
    await expect(
      createClaim(b, {
        orderItemId: item!.id,
        reason: 'other',
        details: 'It has not arrived yet but I want to report it.',
        photos: [],
        outcome: 'refund',
      }),
    ).rejects.toThrow(/days after delivery/);
  });
});

describe('maker time zones', () => {
  it('a Perth maker gets the ship-by reminder at 8am Perth time, not Melbourne’s', async () => {
    const { product, variantId } = await pickVariant((p) => p.productType === 'ready_to_ship', 17);
    const { orderId } = await buyAndPay([{ productId: product.id, variantId }]);
    const [f] = await sql()<{ id: string; makerId: string }[]>`
      update public.fulfilments set estimated_dispatch_date = '2026-11-05'
      where order_id = ${orderId} returning id, maker_id`;
    const [before] = await sql()<{ timezone: string }[]>`
      select timezone from public.makers where id = ${f!.makerId}`;
    await sql()`update public.makers set timezone = 'Australia/Perth' where id = ${f!.makerId}`;
    try {
      const sent = async () =>
        (
          await sql()<{ n: number }[]>`
            select count(*)::int as n from public.email_outbox where template = 'maker_ship_by_reminder'
            and body_text like ${`%${f!.id}%`}`
        )[0]!.n;
      // 8am Melbourne (AEDT) is 5am in Perth: too early.
      await shipByReminders(new Date('2026-11-04T21:00:00Z'));
      expect(await sent()).toBe(0);
      // 7:30am Perth: still too early.
      await shipByReminders(new Date('2026-11-04T23:30:00Z'));
      expect(await sent()).toBe(0);
      // 8am Perth (00:00 UTC): sent, once.
      await shipByReminders(new Date('2026-11-05T00:00:00Z'));
      await shipByReminders(new Date('2026-11-05T01:00:00Z'));
      expect(await sent()).toBe(1);
    } finally {
      await sql()`update public.makers set timezone = ${before!.timezone} where id = ${f!.makerId}`;
    }
  });

  it('sends the Monday summary from 8am in each maker’s own zone', async () => {
    const [perth] = await sql()<{ id: string; timezone: string }[]>`
      select id, timezone from public.makers where shop_status = 'live' and user_id is not null
      order by slug desc limit 1`;
    await sql()`update public.makers set timezone = 'Australia/Perth' where id = ${perth!.id}`;
    const got = async () =>
      (
        await sql()<{ n: number }[]>`
          select count(*)::int as n from public.email_outbox
          where template = 'maker_weekly_summary' and related_entity_id = ${perth!.id}`
      )[0]!.n;
    try {
      const before = await got();
      // Sunday 21:00 UTC: 8am Monday in Melbourne, 5am Monday in Perth.
      const east = await weeklySummaries(new Date('2026-11-01T21:00:00Z'));
      expect(east.sent).toBeGreaterThan(0);
      expect(await got()).toBe(before);
      // Monday 00:00 UTC: 8am in Perth.
      await weeklySummaries(new Date('2026-11-02T00:00:00Z'));
      expect(await got()).toBe(before + 1);
    } finally {
      await sql()`update public.makers set timezone = ${perth!.timezone} where id = ${perth!.id}`;
    }
  });
});
