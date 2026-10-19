import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { closeDb, sql } from '@/lib/db';
import { addToCart, getCart } from '@/lib/services/cart';
import {
  OFFER_LOCK_MINUTES,
  bagDeliveryEstimate,
  checkoutView,
  openCheckout,
  preparePayment,
  saveCheckoutDelivery,
  saveCheckoutDetails,
} from '@/lib/services/checkout';
import { refundOrderItem } from '@/lib/services/webhook';
import { releaseDueTransfers } from '@/lib/services/payouts';
import { activeShippingOffer } from '@/lib/shipping/settings';
import { DEFAULT_SHIPPING_OFFER, type ShippingOffer } from '@/lib/shipping/offer';
import { TERMS } from '@/lib/studio/terms';
import { getSettings, saveSettings } from '@/lib/services/settings';
import { MAKERS, TEST_ADDRESS, buyAndPay, pickVariant, seller } from './helpers';

const DAY = 86_400_000;

async function setOffer(offer: Partial<ShippingOffer>) {
  const value = { ...DEFAULT_SHIPPING_OFFER, monthlyBudgetCents: null, ...offer };
  await sql()`
    insert into public.site_settings (key, value) values ('shipping_offer', ${sql().json(value as never)})
    on conflict (key) do update set value = excluded.value`;
}

async function parcels(orderId: string) {
  return sql()<
    {
      id: string;
      makerId: string;
      shippingCents: number;
      shippingListCents: number;
      buyerShippingCents: number;
      shippingSubsidyCents: number;
      shippingSubsidyStatus: string;
      sellerNetCents: number;
      processingFeeCents: number;
      platformCommissionCents: number;
      subtotalCents: number;
    }[]
  >`
    select id, maker_id, subtotal_cents, shipping_cents, shipping_list_cents, buyer_shipping_cents, shipping_subsidy_cents,
      shipping_subsidy_status, seller_net_cents, processing_fee_cents, platform_commission_cents
    from public.fulfilments where order_id = ${orderId} order by maker_id`;
}

async function order(orderId: string) {
  const [o] = await sql()<
    {
      subtotalCents: number;
      shippingTotalCents: number;
      totalCents: number;
      shippingSavingCents: number;
      shippingOffer: string | null;
      platformFeeTotalCents: number;
    }[]
  >`
    select subtotal_cents, shipping_total_cents, total_cents, shipping_saving_cents, shipping_offer,
      platform_fee_total_cents from public.orders where id = ${orderId}`;
  return o!;
}

/** One ready-to-ship piece from each of the given makers (by index in MAKERS). */
async function piecesFrom(makerIdx: number[], skip = 0) {
  const out = [];
  for (const i of makerIdx) {
    const v = await pickVariant(
      (p) => p.productType === 'ready_to_ship' && p.maker.slug === MAKERS[i]!.slug,
      skip,
    ).catch(() =>
      pickVariant((p) => p.productType !== 'one_of_one' && p.maker.slug === MAKERS[i]!.slug, skip),
    );
    out.push({ productId: v.product.id, variantId: v.variantId });
  }
  return out;
}

async function deliverAndRelease(orderId: string) {
  const at = new Date(Date.now() - (TERMS.releaseDaysAfterDelivery + 1) * DAY);
  await sql()`update public.fulfilments set status = 'delivered', shipped_at = ${new Date(at.getTime() - DAY)},
    delivered_at = ${at} where order_id = ${orderId}`;
  await sql()`update public.makers m set stripe_account_id = coalesce(m.stripe_account_id, 'acct_mock_' || left(m.id::text, 8)),
    stripe_charges_enabled = true where m.id in (select maker_id from public.fulfilments where order_id = ${orderId})`;
  await releaseDueTransfers();
}

async function transfersFor(fulfilmentId: string) {
  return sql()<{ amount: number; source: string | null; kind: string | null }[]>`
    select (data->>'amountCents')::int as amount, data->>'sourceTransaction' as source,
      data->'metadata'->>'kind' as kind
    from public.mock_stripe_objects where type = 'transfer' and data->'metadata'->>'fulfilment_id' = ${fulfilmentId}
    order by created_at`;
}

// Makers' own free-over thresholds would make most seeded parcels free on their own; switch
// them off here so One Off's offer is what's tested, and put them back afterwards.
let thresholds: Array<{ id: string; freeShippingOverCents: number | null }> = [];
beforeAll(async () => {
  thresholds = await sql()`select id, free_shipping_over_cents from public.makers`;
  await sql()`update public.makers set free_shipping_over_cents = null`;
});
beforeEach(() => setOffer({}));
afterAll(async () => {
  await sql()`delete from public.site_settings where key = 'shipping_offer'`;
  await sql()`update public.makers set bundle_shipping = 'none', bundle_percent_off = null`;
  for (const t of thresholds)
    await sql()`update public.makers set free_shipping_over_cents = ${t.freeShippingOverCents} where id = ${t.id}`;
  await closeDb();
});

describe('shipping across makers', () => {
  it('caps what the buyer pays, pays each maker in full and records what One Off covers', async () => {
    await setOffer({ freeOverCents: null });
    const { orderId } = await buyAndPay(await piecesFrom([1, 2, 3]), 'cap@buyer.test');
    const o = await order(orderId);
    const fs = await parcels(orderId);
    expect(fs).toHaveLength(3);

    const makerTotal = fs.reduce((s, f) => s + f.shippingCents, 0);
    const sorted = fs.map((f) => f.shippingCents).sort((a, b) => b - a);
    const expected = Math.min(
      sorted[0]! + sorted.slice(1).reduce((s, c) => s + Math.min(c, 500), 0),
      2000,
      makerTotal,
    );
    expect(o.shippingTotalCents).toBe(expected);
    expect(o.shippingTotalCents).toBeLessThan(makerTotal);
    expect(o.shippingOffer).toBe('cap');
    expect(o.totalCents).toBe(o.subtotalCents + o.shippingTotalCents);
    expect(o.shippingSavingCents).toBe(
      fs.reduce((s, f) => s + f.shippingListCents, 0) - o.shippingTotalCents,
    );
    expect(fs.reduce((s, f) => s + f.buyerShippingCents, 0)).toBe(o.shippingTotalCents);
    for (const f of fs) {
      expect(f.shippingSubsidyCents).toBe(f.shippingCents - f.buyerShippingCents);
      expect(f.shippingSubsidyStatus).toBe(f.shippingSubsidyCents > 0 ? 'pending' : 'none');
      // Makers' net still includes their full shipping.
      expect(f.sellerNetCents).toBe(
        f.subtotalCents - f.platformCommissionCents + f.shippingCents - f.processingFeeCents,
      );
    }
    // Everything paid out (makers' nets, One Off's commission, Stripe's fee) is the buyer's
    // total plus the shipping One Off covers.
    const nets = fs.reduce((s, f) => s + f.sellerNetCents, 0);
    const fees = fs.reduce((s, f) => s + f.processingFeeCents, 0);
    const subsidy = fs.reduce((s, f) => s + f.shippingSubsidyCents, 0);
    expect(nets + o.platformFeeTotalCents + fees).toBe(o.totalCents + subsidy);
  });

  it('is free once the bag reaches the threshold', async () => {
    await setOffer({ freeOverCents: 10000 });
    const { orderId } = await buyAndPay(await piecesFrom([1, 2], 1), 'free@buyer.test');
    const o = await order(orderId);
    expect(o.shippingTotalCents).toBe(0);
    expect(o.shippingOffer).toBe('free_over');
    const fs = await parcels(orderId);
    expect(fs.every((f) => f.buyerShippingCents === 0 && f.shippingCents > 0)).toBe(true);
  });

  it('charges the makers’ own rates when the offer is off', async () => {
    await setOffer({ enabled: false });
    const { orderId } = await buyAndPay(await piecesFrom([1, 2], 2), 'off@buyer.test');
    const o = await order(orderId);
    const fs = await parcels(orderId);
    expect(o.shippingTotalCents).toBe(fs.reduce((s, f) => s + f.shippingCents, 0));
    expect(o.shippingOffer).toBeNull();
    expect(fs.every((f) => f.shippingSubsidyCents === 0)).toBe(true);
  });

  it('pauses for the month once the budget is used up', async () => {
    await setOffer({ freeOverCents: null, monthlyBudgetCents: 1 });
    // Earlier tests in this file have already covered more than A$0.01 this month.
    expect((await activeShippingOffer()).enabled).toBe(false);
    await setOffer({ freeOverCents: null, monthlyBudgetCents: 100_000_000 });
    expect((await activeShippingOffer()).enabled).toBe(true);
  });
});

describe('the bag and checkout show the saving', () => {
  it('shows the makers’ price, what the buyer pays and how far from free shipping', async () => {
    await setOffer({ freeOverCents: 1_000_000 });
    const sessionId = randomUUID();
    for (const l of await piecesFrom([4, 5, 6]))
      await addToCart({ sessionId, userId: null, ...l, quantity: 1 });
    const cart = await getCart(sessionId);
    const bag = await bagDeliveryEstimate(cart.lines, null);
    expect(bag.makers).toBe(3);
    expect(bag.cents).toBeLessThan(bag.listCents);
    expect(bag.cents).toBeLessThanOrEqual(2000);
    expect(bag.applied).toBe('cap');
    expect(bag.toFreeCents).toBe(1_000_000 - cart.totals.subtotalCents);

    const owner = { sessionId, userId: null, email: null };
    await openCheckout(owner);
    const view = await checkoutView(owner);
    expect(view.shippingCents).toBe(bag.cents);
    expect(view.shippingListCents).toBe(bag.listCents);
    expect(view.shippingSavingCents).toBe(bag.listCents - bag.cents);
    expect(view.shippingOffer).toBe('cap');
    expect(view.toFreeCents).toBe(bag.toFreeCents);
  });
});

describe('maker bundle deals', () => {
  it('saves from Shop settings, and rejects a silly discount', async () => {
    const me = seller(9);
    const current = await getSettings(me);
    await saveSettings(me, {
      ...current,
      bundleShipping: 'percent',
      bundlePercentOff: 30,
      bundleMinPieces: 3,
    });
    const saved = await getSettings(me);
    expect(saved.bundleShipping).toBe('percent');
    expect(saved.bundlePercentOff).toBe(30);
    expect(saved.bundleMinPieces).toBe(3);
    await expect(
      saveSettings(me, { ...saved, bundleShipping: 'percent', bundlePercentOff: 95 }),
    ).rejects.toThrow(/between 5% and 90%/);
    await saveSettings(me, { ...saved, bundleShipping: 'none' });
  });

  it('gives free shipping on 2+ pieces from one maker, funded by the maker', async () => {
    await setOffer({ enabled: false });
    const maker = MAKERS[7]!;
    await sql()`update public.makers set bundle_shipping = 'free', bundle_min_pieces = 2 where id = ${maker.id}`;
    const v = await pickVariant(
      (p) => p.productType === 'ready_to_ship' && p.maker.slug === maker.slug,
    );
    const { orderId } = await buyAndPay(
      [{ productId: v.product.id, variantId: v.variantId, quantity: 2 }],
      'bundle@buyer.test',
    );
    const [f] = await parcels(orderId);
    expect(f!.shippingListCents).toBeGreaterThan(0);
    expect(f!.shippingCents).toBe(0);
    expect(f!.buyerShippingCents).toBe(0);
    expect(f!.shippingSubsidyCents).toBe(0);
    const o = await order(orderId);
    expect(o.shippingSavingCents).toBe(f!.shippingListCents);
  });

  it('takes a percentage off from the minimum number of pieces', async () => {
    await setOffer({ enabled: false });
    const maker = MAKERS[8]!;
    await sql()`update public.makers set bundle_shipping = 'percent', bundle_percent_off = 50, bundle_min_pieces = 2
      where id = ${maker.id}`;
    const v = await pickVariant(
      (p) => p.productType === 'ready_to_ship' && p.maker.slug === maker.slug,
    );
    const { orderId } = await buyAndPay(
      [{ productId: v.product.id, variantId: v.variantId, quantity: 2 }],
      'bundle-pct@buyer.test',
    );
    const [f] = await parcels(orderId);
    expect(f!.shippingCents).toBe(Math.round(f!.shippingListCents / 2));
  });
});

describe('paying makers when One Off covers shipping', () => {
  it('sends the maker’s net from the buyer’s charge and the covered shipping separately', async () => {
    await setOffer({ freeOverCents: 10000 });
    // Includes Halde Studio, a founding maker on 0% commission: there's no commission on that
    // parcel to fund the free shipping, so it must come from the platform balance.
    const { orderId } = await buyAndPay(await piecesFrom([0, 1], 3), 'payout@buyer.test');
    await deliverAndRelease(orderId);
    const fs = await parcels(orderId);
    const [charge] = await sql()<
      { total: number }[]
    >`select total_cents as total from public.orders where id = ${orderId}`;
    let sourced = 0;
    for (const f of fs) {
      expect(f.shippingSubsidyCents).toBeGreaterThan(0);
      const ts = await transfersFor(f.id);
      const main = ts.find((t) => t.kind !== 'shipping_subsidy')!;
      const covered = ts.find((t) => t.kind === 'shipping_subsidy')!;
      expect(main.amount).toBe(f.sellerNetCents - f.shippingSubsidyCents);
      expect(main.source).toMatch(/^ch_mock_/);
      expect(covered.amount).toBe(f.shippingSubsidyCents);
      expect(covered.source).toBeNull();
      sourced += main.amount;
      const [row] = await sql()<{ status: string }[]>`
        select shipping_subsidy_status as status from public.fulfilments where id = ${f.id}`;
      expect(row!.status).toBe('created');
    }
    // What leaves the buyer's charge never exceeds what the buyer paid.
    expect(sourced).toBeLessThanOrEqual(charge!.total);

    // Running again never pays twice.
    await releaseDueTransfers();
    for (const f of fs) expect(await transfersFor(f.id)).toHaveLength(2);
  });
});

describe('refunds on parcels where One Off covered shipping', () => {
  it('reverses what the transfer holds and takes the rest off later payouts', async () => {
    await setOffer({ freeOverCents: 10000 });
    const { orderId } = await buyAndPay(await piecesFrom([2, 3], 4), 'refund-after@buyer.test');
    await deliverAndRelease(orderId);
    const [f] = await parcels(orderId);
    const [item] = await sql()<{ id: string; lineTotalCents: number; sellerNetCents: number }[]>`
      select id, line_total_cents, seller_net_cents from public.order_items where fulfilment_id = ${f!.id}`;
    const [before] = await sql()<{ transferAmountCents: number }[]>`
      select transfer_amount_cents from public.fulfilments where id = ${f!.id}`;
    // The maker's share of the item is more than the main transfer holds (shipping came separately).
    expect(item!.sellerNetCents).toBeGreaterThan(before!.transferAmountCents);

    const res = await refundOrderItem({
      orderItemId: item!.id,
      reason: 'test',
      actorUserId: null,
    });
    expect(res.reversal).toBe('deferred');
    const [after] = await sql()<{ reversed: number }[]>`
      select transfer_reversed_cents as reversed from public.fulfilments where id = ${f!.id}`;
    expect(after!.reversed).toBe(before!.transferAmountCents);
    const [adj] = await sql()<{ cents: number }[]>`
      select coalesce(sum(amount_cents), 0)::int as cents from public.maker_adjustments where fulfilment_id = ${f!.id}`;
    expect(adj!.cents + after!.reversed).toBe(item!.sellerNetCents);
  });

  it('takes a refund off the covered shipping when it hasn’t been paid yet', async () => {
    await setOffer({ freeOverCents: 10000 });
    const { orderId } = await buyAndPay(await piecesFrom([4, 5]), 'refund-before@buyer.test');
    const [f] = await parcels(orderId);
    // Main transfer made, covered shipping not paid yet (balance short).
    await sql()`update public.fulfilments set status = 'completed', stripe_transfer_id = 'tr_test_' || left(id::text, 8),
      transfer_status = 'created', transfer_amount_cents = seller_net_cents - shipping_subsidy_cents,
      shipping_subsidy_due_cents = shipping_subsidy_cents, shipping_subsidy_status = 'failed' where id = ${f!.id}`;
    const [item] = await sql()<{ id: string; sellerNetCents: number }[]>`
      select id, seller_net_cents from public.order_items where fulfilment_id = ${f!.id}`;
    const [ful] = await sql()<{ transferAmountCents: number }[]>`
      select transfer_amount_cents from public.fulfilments where id = ${f!.id}`;
    // Refunding the piece: the main transfer covers most of the maker's share; the rest comes off
    // the covered shipping that hasn't gone out yet, not off a future payout.
    const res = await refundOrderItem({ orderItemId: item!.id, reason: 'test', actorUserId: null });
    expect(res.reversal).toBe('reversed');
    const rest = item!.sellerNetCents - ful!.transferAmountCents;
    expect(rest).toBeGreaterThan(0);
    const [row] = await sql()<{ due: number }[]>`
      select shipping_subsidy_due_cents as due from public.fulfilments where id = ${f!.id}`;
    expect(row!.due).toBe(f!.shippingSubsidyCents - rest);
    const [adj] = await sql()<{ n: number }[]>`
      select count(*)::int as n from public.maker_adjustments where fulfilment_id = ${f!.id}`;
    expect(adj!.n).toBe(0);
  });
});

describe('the total can’t change between checkout and payment', () => {
  it('keeps the shipping offer a checkout was priced with', async () => {
    await setOffer({ freeOverCents: null });
    const sessionId = randomUUID();
    for (const l of await piecesFrom([6, 7]))
      await addToCart({ sessionId, userId: null, ...l, quantity: 1 });
    const owner = { sessionId, userId: null, email: null };
    await openCheckout(owner);
    await saveCheckoutDetails(owner, { email: 'locked@buyer.test', phone: '' });
    await saveCheckoutDelivery(owner, { address: TEST_ADDRESS, speeds: {} });
    const shown = await checkoutView(owner);
    expect(shown.shippingOffer).toBe('cap');

    // The offer is switched off (or the budget runs out) while the buyer is paying.
    await setOffer({ enabled: false });
    const paid = await preparePayment(owner, new Date(), shown.totalCents);
    expect(paid.totalCents).toBe(shown.totalCents);

    // After the lock runs out, the new price applies, and a stale total is refused.
    const later = new Date(Date.now() + (OFFER_LOCK_MINUTES + 1) * 60_000);
    await expect(preparePayment(owner, later, shown.totalCents)).rejects.toThrow(
      /Your total is now/,
    );
  });
});
