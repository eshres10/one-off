import { describe, expect, it } from 'vitest';
import { computeCartTotals, makerShippingCents } from '@/lib/domain/cart';
import type { CartLine, MakerShipping } from '@/lib/domain/types';

const line = (over: Partial<CartLine>): CartLine => ({
  productId: 'p1',
  variantId: 'v1',
  makerId: 'm1',
  makerName: 'Maker One',
  productTitle: 'Dress',
  variantLabel: 'S',
  productType: 'ready_to_ship',
  quantity: 1,
  unitPriceCents: 25_000,
  ...over,
});

const shipping = new Map<string, MakerShipping>([
  [
    'm1',
    { makerId: 'm1', shippingStandardCents: 1200, freeShippingOverCents: 40_000, dispatchDays: 2 },
  ],
  [
    'm2',
    { makerId: 'm2', shippingStandardCents: 1500, freeShippingOverCents: null, dispatchDays: 3 },
  ],
]);

describe('cart totals', () => {
  it('computes subtotal, shipping and total for a single maker', () => {
    const t = computeCartTotals([line({ quantity: 1 })], shipping);
    expect(t.subtotalCents).toBe(25_000);
    expect(t.shippingCents).toBe(1200);
    expect(t.totalCents).toBe(26_200);
    expect(t.itemCount).toBe(1);
  });

  it('charges shipping once per maker and groups lines by maker', () => {
    const t = computeCartTotals(
      [
        line({ variantId: 'a', unitPriceCents: 18_000 }),
        line({ variantId: 'b', unitPriceCents: 15_000 }),
        line({ variantId: 'c', makerId: 'm2', makerName: 'Maker Two', unitPriceCents: 32_000 }),
      ],
      shipping,
    );
    expect(t.groups).toHaveLength(2);
    expect(t.groups[0]?.subtotalCents).toBe(33_000);
    expect(t.groups[0]?.shippingCents).toBe(1200);
    expect(t.groups[1]?.shippingCents).toBe(1500);
    expect(t.shippingCents).toBe(2700);
    expect(t.totalCents).toBe(33_000 + 32_000 + 2700);
  });

  it('waives shipping at the maker free-shipping threshold', () => {
    expect(makerShippingCents(40_000, shipping.get('m1'))).toBe(0);
    expect(makerShippingCents(39_999, shipping.get('m1'))).toBe(1200);
  });

  it('multiplies quantity', () => {
    const t = computeCartTotals([line({ quantity: 3, unitPriceCents: 15_000 })], shipping);
    expect(t.subtotalCents).toBe(45_000);
    expect(t.shippingCents).toBe(0);
    expect(t.itemCount).toBe(3);
  });

  it('handles an empty cart', () => {
    const t = computeCartTotals([], shipping);
    expect(t.totalCents).toBe(0);
    expect(t.groups).toEqual([]);
  });

  it('rejects invalid quantities and prices', () => {
    expect(() => computeCartTotals([line({ quantity: 0 })], shipping)).toThrow();
    expect(() => computeCartTotals([line({ unitPriceCents: 10.5 })], shipping)).toThrow();
  });

  it('requires shipping settings for every maker in the cart', () => {
    expect(() => computeCartTotals([line({ makerId: 'unknown' })], shipping)).toThrow(/shipping/);
  });
});
