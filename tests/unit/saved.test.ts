import { describe, expect, it } from 'vitest';
import { savedStatus, topAlert } from '@/lib/domain/saved';

const base = {
  priceCents: 28000,
  priceAtSave: 28000,
  productType: 'ready_to_ship' as const,
  totalStock: 6,
  leadTimeDays: null,
  backInSize: false,
};

describe('savedStatus', () => {
  it('reports a price drop with the saved price', () => {
    expect(savedStatus({ ...base, priceAtSave: 31000 })).toMatchObject({
      kind: 'price_drop',
      text: 'Price drop · was A$310',
      urgent: true,
    });
  });
  it('ignores price rises', () => {
    expect(savedStatus({ ...base, priceAtSave: 20000 }).kind).toBe('info');
  });
  it('flags low stock at 2 or fewer', () => {
    expect(savedStatus({ ...base, totalStock: 2 }).text).toBe('Only 2 left');
    expect(savedStatus({ ...base, totalStock: 3 }).kind).toBe('info');
    expect(savedStatus({ ...base, totalStock: 0 }).text).toBe('Sold out');
  });
  it('prefers a price drop over low stock', () => {
    expect(savedStatus({ ...base, priceAtSave: 31000, totalStock: 1 }).kind).toBe('price_drop');
  });
  it('says when a watched size is back', () => {
    expect(savedStatus({ ...base, backInSize: true }).text).toBe('Back in your size');
  });
  it('falls back to the lead time for made to order', () => {
    expect(
      savedStatus({ ...base, productType: 'made_to_order', totalStock: 0, leadTimeDays: 14 }).text,
    ).toBe('Made to order · 14 days');
  });
});

describe('topAlert', () => {
  it('picks a price drop before low stock', () => {
    const items = [
      { id: 'a', status: savedStatus({ ...base, totalStock: 1 }) },
      { id: 'b', status: savedStatus({ ...base, priceAtSave: 30000 }) },
    ];
    expect(topAlert(items)?.id).toBe('b');
  });
});
