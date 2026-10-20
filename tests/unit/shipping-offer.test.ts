import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SHIPPING_OFFER,
  applyShippingOffer,
  makerParcelPrice,
  offerLine,
  parseShippingOffer,
  type OfferParcel,
  type ShippingOffer,
} from '@/lib/shipping/offer';
import { splitOrder } from '@/lib/domain/split';
import { splitPayout } from '@/lib/services/payouts';
import type { CartLine, MakerShipping } from '@/lib/domain/types';

const OFFER: ShippingOffer = {
  enabled: true,
  extraMakerCents: 500,
  capCents: 2000,
  freeOverCents: 30000,
  monthlyBudgetCents: null,
};

const std = (makerId: string, cents: number, listCents = cents): OfferParcel => ({
  makerId,
  speed: 'standard',
  makerCents: cents,
  listCents,
});

const sum = (m: Map<string, number>) => Array.from(m.values()).reduce((s, c) => s + c, 0);

describe('a maker’s parcel price', () => {
  const rates = { interstate: { standard: 1200, express: 1800 } };

  it('is the maker’s rate when no deal applies', () => {
    expect(
      makerParcelPrice({
        zone: 'interstate',
        speed: 'standard',
        rates,
        makerSubtotalCents: 20000,
        pieces: 1,
      }),
    ).toEqual({ listCents: 1200, makerCents: 1200, makerDeal: null });
  });

  it('applies the maker’s free-over threshold to standard only', () => {
    const r = { ...rates, freeOverCents: 30000 };
    expect(
      makerParcelPrice({
        zone: 'interstate',
        speed: 'standard',
        rates: r,
        makerSubtotalCents: 30000,
        pieces: 1,
      }),
    ).toEqual({ listCents: 1200, makerCents: 0, makerDeal: 'free_over' });
    expect(
      makerParcelPrice({
        zone: 'interstate',
        speed: 'express',
        rates: r,
        makerSubtotalCents: 30000,
        pieces: 1,
      }).makerCents,
    ).toBe(1800);
  });

  it('applies a bundle deal from the minimum number of pieces', () => {
    const free = { kind: 'free', minPieces: 2 } as const;
    const pct = { kind: 'percent', percentOff: 25, minPieces: 3 } as const;
    const base = {
      zone: 'interstate',
      speed: 'standard',
      rates,
      makerSubtotalCents: 20000,
    } as const;
    expect(makerParcelPrice({ ...base, pieces: 1, bundle: free }).makerCents).toBe(1200);
    expect(makerParcelPrice({ ...base, pieces: 2, bundle: free })).toEqual({
      listCents: 1200,
      makerCents: 0,
      makerDeal: 'bundle',
    });
    expect(makerParcelPrice({ ...base, pieces: 2, bundle: pct }).makerCents).toBe(1200);
    expect(makerParcelPrice({ ...base, pieces: 3, bundle: pct }).makerCents).toBe(900);
    expect(
      makerParcelPrice({ ...base, speed: 'express', pieces: 3, bundle: free }).makerCents,
    ).toBe(1800);
  });

  it('falls back to the site default rates', () => {
    expect(
      makerParcelPrice({ zone: 'sameState', speed: 'standard', makerSubtotalCents: 0, pieces: 1 })
        .makerCents,
    ).toBe(1000);
  });
});

describe('Off One’s shipping offer', () => {
  it('changes nothing when it’s off', () => {
    const r = applyShippingOffer([std('a', 1200), std('b', 1200)], 10000, {
      ...OFFER,
      enabled: false,
    });
    expect(r.buyerTotalCents).toBe(2400);
    expect(r.subsidyCents).toBe(0);
    expect(r.applied).toBeNull();
  });

  it('charges one maker their own rate', () => {
    const r = applyShippingOffer([std('a', 1200)], 10000, OFFER);
    expect(r.buyerTotalCents).toBe(1200);
    expect(r.subsidyCents).toBe(0);
    expect(r.applied).toBeNull();
    expect(r.toFreeCents).toBe(20000);
  });

  it('adds A$5 per extra maker and never more than the cap', () => {
    const two = applyShippingOffer([std('a', 1200), std('b', 1000)], 20000, OFFER);
    expect(two.buyerTotalCents).toBe(1700);
    expect(two.subsidyCents).toBe(500);
    expect(two.applied).toBe('cap');

    const three = applyShippingOffer(
      [std('a', 1200), std('b', 1200), std('c', 1200)],
      25000,
      OFFER,
    );
    expect(three.makerTotalCents).toBe(3600);
    expect(three.buyerTotalCents).toBe(2000); // 12 + 5 + 5 = 22, capped at 20
    expect(three.subsidyCents).toBe(1600);
    expect(three.savingCents).toBe(1600);
    expect(sum(three.buyerByMaker)).toBe(2000);
  });

  it('caps a single dear parcel too', () => {
    const r = applyShippingOffer([std('a', 2600)], 10000, OFFER);
    expect(r.buyerTotalCents).toBe(2000);
    expect(r.subsidyCents).toBe(600);
  });

  it('never charges more than the makers’ own prices', () => {
    const r = applyShippingOffer([std('a', 300), std('b', 200)], 10000, OFFER);
    expect(r.buyerTotalCents).toBe(500);
    expect(r.applied).toBeNull();
  });

  it('is free once the pieces reach the threshold', () => {
    const r = applyShippingOffer([std('a', 1200), std('b', 1200)], 30000, OFFER);
    expect(r.buyerTotalCents).toBe(0);
    expect(r.subsidyCents).toBe(2400);
    expect(r.applied).toBe('free_over');
    expect(r.toFreeCents).toBeNull();
  });

  it('leaves express parcels at the maker’s price', () => {
    const r = applyShippingOffer(
      [std('a', 1200), { makerId: 'b', speed: 'express', makerCents: 1800, listCents: 1800 }],
      40000,
      OFFER,
    );
    expect(r.buyerByMaker.get('a')).toBe(0);
    expect(r.buyerByMaker.get('b')).toBe(1800);
    expect(r.buyerTotalCents).toBe(1800);
  });

  it('counts a maker’s bundle deal in the saving but not in Off One’s subsidy', () => {
    const r = applyShippingOffer([std('a', 0, 1200), std('b', 1000)], 10000, OFFER);
    expect(r.makerTotalCents).toBe(1000);
    expect(r.buyerTotalCents).toBe(1000);
    expect(r.subsidyCents).toBe(0);
    expect(r.savingCents).toBe(1200);
  });

  it('splits the buyer’s price across parcels so every cent adds up', () => {
    const r = applyShippingOffer(
      [std('a', 1300), std('b', 1100), std('c', 900), std('d', 700)],
      10000,
      { ...OFFER, capCents: 1999 },
    );
    expect(r.buyerTotalCents).toBe(1999);
    expect(sum(r.buyerByMaker)).toBe(1999);
    for (const [makerId, cents] of r.buyerByMaker) {
      const maker = { a: 1300, b: 1100, c: 900, d: 700 }[makerId as 'a']!;
      expect(cents).toBeGreaterThanOrEqual(0);
      expect(cents).toBeLessThanOrEqual(maker);
    }
  });

  it('is off until the admin switches it on', () => {
    expect(DEFAULT_SHIPPING_OFFER.enabled).toBe(false);
    const r = applyShippingOffer([std('a', 1200), std('b', 1200)], 40000, DEFAULT_SHIPPING_OFFER);
    expect(r.buyerTotalCents).toBe(2400);
    expect(r.subsidyCents).toBe(0);
  });

  it('reads stored settings defensively', () => {
    expect(parseShippingOffer(null)).toEqual(DEFAULT_SHIPPING_OFFER);
    expect(parseShippingOffer({ enabled: false, capCents: null, extraMakerCents: -5 })).toEqual({
      ...DEFAULT_SHIPPING_OFFER,
      enabled: false,
      capCents: null,
    });
  });

  it('describes itself for product pages', () => {
    const fmt = (c: number) => `A$${c / 100}`;
    expect(offerLine(OFFER, fmt)).toBe(
      'Shipping capped at A$20, however many makers · free standard shipping over A$300.',
    );
    expect(offerLine({ ...OFFER, enabled: false }, fmt)).toBeNull();
  });
});

describe('splitting an order with the shipping offer', () => {
  const line = (makerId: string, cents: number): CartLine => ({
    productId: `p-${makerId}`,
    variantId: `v-${makerId}`,
    makerId,
    makerName: makerId,
    productTitle: 'Piece',
    productSlug: 'piece',
    productType: 'ready_to_ship',
    variantLabel: 'AU 10',
    imageUrl: null,
    quantity: 1,
    unitPriceCents: cents,
    leadTimeDays: null,
  });
  const ship = (makerId: string): [string, MakerShipping] => [
    makerId,
    { makerId, shippingStandardCents: 1200, freeShippingOverCents: null, dispatchDays: 2 },
  ];

  it('pays makers their full shipping and records what Off One covers', () => {
    const plan = splitOrder(
      [line('a', 10000), line('b', 10000)],
      new Map([ship('a'), ship('b')]),
      1500,
      new Map([
        ['a', 1000],
        ['b', 700],
      ]),
    );
    expect(plan.shippingTotalCents).toBe(1700);
    expect(plan.makerShippingTotalCents).toBe(2400);
    expect(plan.shippingSubsidyTotalCents).toBe(700);
    expect(plan.totalCents).toBe(20000 + 1700);
    const a = plan.fulfilments.find((f) => f.makerId === 'a')!;
    expect(a.shippingCents).toBe(1200);
    expect(a.buyerShippingCents).toBe(1000);
    expect(a.shippingSubsidyCents).toBe(200);
    expect(a.sellerNetCents).toBe(10000 - 1500 + 1200);
  });

  it('refuses a buyer price above the maker’s', () => {
    expect(() =>
      splitOrder([line('a', 10000)], new Map([ship('a')]), 1500, new Map([['a', 1300]])),
    ).toThrow();
  });
});

describe('splitting a payout when Off One covered shipping', () => {
  it('sends the buyer-funded part from the charge and the covered shipping separately', () => {
    expect(
      splitPayout({
        owedCents: 9700,
        sellerNetCents: 9700,
        subsidyCents: 1500,
        refundedShareCents: 0,
      }),
    ).toEqual({ amount: 8200, subsidyDue: 1500 });
  });

  it('never pays more than the maker is owed after a refund', () => {
    // A$297 + A$3 pieces, free shipping (A$15 covered), the A$297 one refunded after a claim.
    const r = splitPayout({
      owedCents: 26445 - 25245,
      sellerNetCents: 26445,
      subsidyCents: 1500,
      refundedShareCents: 25245,
    });
    expect(r).toEqual({ amount: 0, subsidyDue: 1200 });
    expect(r.amount + r.subsidyDue).toBe(1200);
  });

  it('takes what the maker owes off the total, not just one part', () => {
    const r = splitPayout({
      owedCents: 9700 - 9000,
      sellerNetCents: 9700,
      subsidyCents: 1500,
      refundedShareCents: 0,
    });
    expect(r.amount + r.subsidyDue).toBe(700);
    expect(r.amount).toBeLessThanOrEqual(9700 - 1500);
  });

  it('pays nothing when nothing is owed', () => {
    expect(
      splitPayout({
        owedCents: -50,
        sellerNetCents: 1000,
        subsidyCents: 500,
        refundedShareCents: 1200,
      }),
    ).toEqual({ amount: 0, subsidyDue: 0 });
  });
});
