import { describe, expect, it } from 'vitest';
import { commissionCents, sellerNetCents } from '@/lib/domain/commission';
import { splitOrder } from '@/lib/domain/split';
import type { CartLine, MakerShipping } from '@/lib/domain/types';

describe('commission calculation', () => {
  it('takes 15% by default', () => {
    expect(commissionCents(20_000)).toBe(3_000);
    expect(sellerNetCents(20_000)).toBe(17_000);
  });

  it('rounds half up to whole cents and always sums to the line total', () => {
    expect(commissionCents(10_001, 1500)).toBe(1_500); // 1500.15 -> 1500
    expect(commissionCents(10_010, 1500)).toBe(1_502); // 1501.5 -> 1502
    for (const total of [1, 99, 14_999, 24_950, 49_999]) {
      expect(commissionCents(total) + sellerNetCents(total)).toBe(total);
    }
  });

  it('supports other fee rates and rejects bad input', () => {
    expect(commissionCents(10_000, 0)).toBe(0);
    expect(commissionCents(10_000, 1000)).toBe(1_000);
    expect(() => commissionCents(-1)).toThrow();
    expect(() => commissionCents(100, 20_000)).toThrow();
  });
});

describe('multi-maker order splitting', () => {
  const shipping = new Map<string, MakerShipping>([
    [
      'a',
      { makerId: 'a', shippingStandardCents: 1000, freeShippingOverCents: null, dispatchDays: 2 },
    ],
    [
      'b',
      { makerId: 'b', shippingStandardCents: 1500, freeShippingOverCents: null, dispatchDays: 2 },
    ],
  ]);
  const base = {
    productTitle: 'x',
    variantLabel: 'M',
    productType: 'ready_to_ship' as const,
    makerName: 'n',
  };
  const lines: CartLine[] = [
    {
      ...base,
      productId: 'p1',
      variantId: 'v1',
      makerId: 'a',
      quantity: 1,
      unitPriceCents: 20_000,
    },
    {
      ...base,
      productId: 'p2',
      variantId: 'v2',
      makerId: 'b',
      quantity: 2,
      unitPriceCents: 15_000,
    },
    {
      ...base,
      productId: 'p3',
      variantId: 'v3',
      makerId: 'a',
      quantity: 1,
      unitPriceCents: 30_000,
      productType: 'made_to_order',
    },
  ];

  it('creates one fulfilment per maker with commission per item', () => {
    const plan = splitOrder(lines, shipping, 1500);
    expect(plan.fulfilments.map((f) => f.makerId)).toEqual(['a', 'b']);
    const a = plan.fulfilments[0]!;
    expect(a.items).toHaveLength(2);
    expect(a.subtotalCents).toBe(50_000);
    expect(a.platformCommissionCents).toBe(7_500);
    expect(a.sellerNetCents).toBe(50_000 - 7_500 + 1_000);
    const b = plan.fulfilments[1]!;
    expect(b.items[0]?.lineTotalCents).toBe(30_000);
    expect(b.sellerNetCents).toBe(30_000 - 4_500 + 1_500);
  });

  it('balances: buyer total = platform fee + all seller nets', () => {
    const plan = splitOrder(lines, shipping, 1500);
    const nets = plan.fulfilments.reduce((s, f) => s + f.sellerNetCents, 0);
    expect(plan.totalCents).toBe(80_000 + 2_500);
    expect(plan.platformFeeTotalCents + nets).toBe(plan.totalCents);
  });

  it('refuses an empty cart', () => {
    expect(() => splitOrder([], shipping, 1500)).toThrow();
  });
});
