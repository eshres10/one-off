import { afterAll, describe, expect, it, vi } from 'vitest';
import { closeDb, sql } from '@/lib/db';
import { payments } from '@/lib/payments';
import { createClaim, resolveClaim } from '@/lib/services/claims';
import { markDelivered, releaseDueTransfers } from '@/lib/services/payouts';
import {
  addReturnTracking,
  blockerFor,
  getReturnableItem,
  markReturnDelivered,
  markReturnReceived,
  processReturns,
  startReturn,
} from '@/lib/services/returns';
import { getPayoutAdjustments } from '@/lib/queries/payouts';
import { getReturnPolicy } from '@/lib/returns/policy';
import { SITE } from '@/lib/site/config';
import { TERMS } from '@/lib/studio/terms';
import { ADMIN, PRODUCTS, buyAndPay, buyer, seller, MAKERS } from './helpers';

const ADMIN_ACTOR = { id: ADMIN.id, role: 'admin' as const, makerId: null };

afterAll(closeDb);

const DAY = 86_400_000;

/** A paid order for buyer `i` of the given piece, delivered `daysAgo` days ago. */
async function deliveredOrder(productId: string, variantId: string, daysAgo: number, i: number) {
  const b = buyer(i);
  const { orderId } = await buyAndPay([{ productId, variantId }], b.email, b.id);
  const [f] = await sql()<{ id: string; makerId: string }[]>`
    update public.fulfilments set status = 'shipped', shipped_at = now() - interval '20 days'
    where order_id = ${orderId} returning id, maker_id`;
  await markDelivered(f!.id, 'buyer', new Date(Date.now() - daysAgo * DAY));
  const [item] = await sql()<{ id: string; lineTotalCents: number; sellerNetCents: number }[]>`
    select id, line_total_cents, seller_net_cents from public.order_items where order_id = ${orderId}`;
  return { orderId, fulfilmentId: f!.id, makerId: f!.makerId, item: item!, buyer: b };
}

/** A well-stocked ready-to-ship variant; `n` picks a different one for each test. */
async function readyToShip(n: number, daysAgo: number, i: number) {
  const [v] = await sql()<{ productId: string; variantId: string }[]>`
    select p.id as product_id, v.id as variant_id from public.products p
    join public.product_variants v on v.product_id = p.id and v.is_active and v.stock_quantity >= 3
    join public.makers m on m.id = p.maker_id and m.shop_status = 'live'
    where p.product_type = 'ready_to_ship' and p.status = 'approved' and not ('preview-only' = any(p.tags))
    order by v.stock_quantity desc, v.id offset ${n} limit 1`;
  return deliveredOrder(v!.productId, v!.variantId, daysAgo, i);
}

/** Any in-stock piece of a type (one-of-ones only ever have one). */
async function anyOf(type: 'made_to_order' | 'one_of_one', skip = 0) {
  const ids = PRODUCTS.filter((p) => p.productType === type).map((p) => p.id);
  const rows = await sql()<{ productId: string; variantId: string }[]>`
    select p.id as product_id, v.id as variant_id from public.products p
    join public.product_variants v on v.product_id = p.id and v.is_active
    where p.id in ${sql()(ids)} and p.status = 'approved'
      and (v.stock_quantity >= 1 or p.product_type = 'made_to_order')
    order by p.id offset ${skip} limit 1`;
  return rows[0]!;
}

const makerOf = (makerId: string) => {
  const i = MAKERS.findIndex((m) => m.id === makerId);
  return seller(i);
};

const returnRow = async (id: string) =>
  (
    await sql()<{ status: string; refundAmount: number | null; refundSource: string | null }[]>`
      select status, refund_amount, refund_source from public.returns where id = ${id}`
  )[0]!;

describe('change-of-mind returns', () => {
  it('offers a return on a ready-to-ship piece delivered 3 days ago, not on made to order or one of one', async () => {
    const ready = await readyToShip(0, 3, 5);
    const item = await getReturnableItem(ready.buyer, ready.item.id);
    expect(item!.returnPolicy).toMatchObject({
      type: 'ready_to_ship',
      changeOfMind: true,
      windowDays: 14,
    });
    expect(blockerFor(item!)).toBeNull();

    const mto = await anyOf('made_to_order', 3);
    const m = await deliveredOrder(mto.productId, mto.variantId, 3, 6);
    const mItem = await getReturnableItem(m.buyer, m.item.id);
    expect(blockerFor(mItem!)).toBe('Not returnable for change of mind.');

    const ooo = await anyOf('one_of_one', 2);
    const o = await deliveredOrder(ooo.productId, ooo.variantId, 3, 7);
    const oItem = await getReturnableItem(o.buyer, o.item.id);
    expect(blockerFor(oItem!)).toBe('Not returnable for change of mind.');
    await expect(
      startReturn(o.buyer, { orderItemId: o.item.id, conditionConfirmed: true }),
    ).rejects.toThrow(/Not returnable/);

    // Faulty or not as described still works for every type, through Report a problem.
    for (const d of [m, o]) {
      const { caseNumber, claimId } = await createClaim(d.buyer, {
        orderItemId: d.item.id,
        reason: 'other',
        details: 'A seam has come apart along the side already.',
        photos: [],
        outcome: 'repair',
      });
      expect(caseNumber).toMatch(/^OO-C-\d+$/);
      // Close it so it doesn't count as overdue in other tests' escalation checks.
      await resolveClaim(ADMIN_ACTOR, claimId, { resolution: 'repair' });
    }
  });

  it('refuses a return 15 days after delivery', async () => {
    const d = await readyToShip(1, 15, 8);
    const item = await getReturnableItem(d.buyer, d.item.id);
    expect(blockerFor(item!)).toMatch(/window has closed/);
    await expect(
      startReturn(d.buyer, { orderItemId: d.item.id, conditionConfirmed: true }),
    ).rejects.toThrow(/window has closed/);
  });

  it('one return per piece; the maker marks it received and the buyer is refunded', async () => {
    const d = await readyToShip(2, 3, 9);
    const r = await startReturn(d.buyer, {
      orderItemId: d.item.id,
      reason: 'doesnt_fit',
      conditionConfirmed: true,
    });
    expect(r.number).toMatch(/^OO-R-\d{4,}$/);
    await expect(
      startReturn(d.buyer, { orderItemId: d.item.id, conditionConfirmed: true }),
    ).rejects.toThrow(/already been started/);
    await addReturnTracking(d.buyer, r.id, { carrier: 'auspost', tracking: 'AP123456789' });
    expect((await returnRow(r.id)).status).toBe('in_transit');

    await markReturnReceived(makerOf(d.makerId), r.id);
    const after = await returnRow(r.id);
    expect(after.status).toBe('refunded');
    expect(after.refundAmount).toBe(d.item.lineTotalCents);
    expect(after.refundSource).toBe('maker');
    const [refund] = await sql()<{ n: number }[]>`
      select count(*)::int as n from public.refunds where order_item_id = ${d.item.id}`;
    expect(refund!.n).toBe(1);
    const emails = await sql()<{ template: string }[]>`
      select template from public.email_outbox where related_entity_id = ${r.id}`;
    expect(emails.map((e) => e.template).sort()).toEqual(
      expect.arrayContaining(['return_incoming', 'return_refunded', 'return_started']),
    );
  });

  it('refunds automatically when tracking shows it delivered and the maker does nothing for 3 business days', async () => {
    const d = await readyToShip(3, 2, 10);
    const r = await startReturn(d.buyer, { orderItemId: d.item.id, conditionConfirmed: true });
    await addReturnTracking(d.buyer, r.id, { carrier: 'auspost', tracking: 'AP987654321' });
    const arrived = new Date('2026-11-02T00:00:00Z'); // a Monday
    expect(await markReturnDelivered(r.id, arrived)).toBe(true);
    // Two business days later: still the maker's to confirm.
    await processReturns(new Date('2026-11-04T01:00:00Z'));
    expect((await returnRow(r.id)).status).toBe('in_transit');
    await processReturns(new Date('2026-11-05T01:00:00Z'));
    const after = await returnRow(r.id);
    expect(after.status).toBe('refunded');
    expect(after.refundSource).toBe('auto');
  });

  it('a return after payout reverses the transfer, or comes off the next payout, and shows on Payouts', async () => {
    // Paid out, then returned: the transfer is reversed by the maker's share.
    const a = await readyToShip(4, TERMS.releaseDaysAfterDelivery + 1, 11);
    await releaseDueTransfers();
    const [fa] = await sql()<{ transferId: string | null }[]>`
      select stripe_transfer_id as transfer_id from public.fulfilments where id = ${a.fulfilmentId}`;
    expect(fa!.transferId).toMatch(/^tr_mock_/);
    const ra = await startReturn(a.buyer, { orderItemId: a.item.id, conditionConfirmed: true });
    await markReturnReceived(makerOf(a.makerId), ra.id);
    const [reversal] = await sql()<{ n: number }[]>`
      select count(*)::int as n from public.mock_stripe_objects
      where type = 'transfer_reversal' and data->>'transferId' = ${fa!.transferId}`;
    expect(reversal!.n).toBe(1);

    // The reversal fails (not enough balance): it's owed from the next payout instead.
    const b = await readyToShip(5, TERMS.releaseDaysAfterDelivery + 1, 12);
    await releaseDueTransfers();
    const rb = await startReturn(b.buyer, { orderItemId: b.item.id, conditionConfirmed: true });
    const spy = vi
      .spyOn(payments(), 'reverseTransfer')
      .mockRejectedValueOnce(new Error('insufficient balance'));
    await markReturnReceived(makerOf(b.makerId), rb.id);
    spy.mockRestore();
    const [adj] = await sql()<{ amountCents: number; reason: string }[]>`
      select amount_cents, reason from public.maker_adjustments where return_id = ${rb.id}`;
    // The maker gives back their share only: One Off's commission is refunded to them.
    expect(adj!.amountCents).toBe(b.item.sellerNetCents);
    expect(adj!.reason).toMatch(/^Return OO-R-/);

    const lines = await getPayoutAdjustments(makerOf(b.makerId));
    const line = lines.find((l) => l.id === rb.id)!;
    expect(line.label).toMatch(/^Return OO-R-/);
    expect(line.how).toBe('next_payout');
    expect(line.amountCents).toBe(b.item.sellerNetCents);
  });

  it('keeps the policy stored on the order item when the config changes later', async () => {
    const d = await readyToShip(6, 1, 13);
    const before = (await getReturnableItem(d.buyer, d.item.id))!.returnPolicy;
    const original = SITE.returns.readyToShipWindowDays;
    (SITE.returns as { readyToShipWindowDays: number }).readyToShipWindowDays = 7;
    try {
      expect(getReturnPolicy('ready_to_ship').windowDays).toBe(7);
      const after = (await getReturnableItem(d.buyer, d.item.id))!.returnPolicy;
      expect(after).toEqual(before);
      expect(after!.windowDays).toBe(14);
    } finally {
      (SITE.returns as { readyToShipWindowDays: number }).readyToShipWindowDays = original;
    }
  });
});
