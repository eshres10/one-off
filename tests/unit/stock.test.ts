import { describe, expect, it } from 'vitest';
import { productBadges, validateStock, variantAvailability } from '@/lib/domain/stock';

const v = (stockQuantity: number, over = {}) => ({
  id: 'v',
  stockQuantity,
  isActive: true,
  lowStockThreshold: 2,
  ...over,
});

describe('stock validation', () => {
  it('classifies availability', () => {
    expect(variantAvailability(v(0))).toBe('sold_out');
    expect(variantAvailability(v(2))).toBe('low_stock');
    expect(variantAvailability(v(5))).toBe('in_stock');
    expect(variantAvailability(v(5, { isActive: false }))).toBe('sold_out');
  });

  it('allows quantities within stock', () => {
    expect(validateStock(v(3), 'ready_to_ship', 2)).toEqual({ ok: true });
  });

  it('accounts for what is already in the bag', () => {
    const r = validateStock(v(3), 'ready_to_ship', 2, 2);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Only 3 left/);
  });

  it('rejects sold out sizes and invalid quantities', () => {
    expect(validateStock(v(0), 'ready_to_ship', 1).ok).toBe(false);
    expect(validateStock(v(5), 'ready_to_ship', 0).ok).toBe(false);
    expect(validateStock(v(50), 'ready_to_ship', 11).ok).toBe(false);
  });

  it('limits one-of-one pieces to a single unit', () => {
    expect(validateStock(v(1), 'one_of_one', 1)).toEqual({ ok: true });
    expect(validateStock(v(1), 'one_of_one', 1, 1).ok).toBe(false);
  });

  it('derives product badges', () => {
    expect(productBadges('ready_to_ship', [v(1), v(8)])).toEqual(['ready_to_ship', 'low_stock']);
    expect(productBadges('made_to_order', [v(1)])).toEqual(['made_to_order']);
    expect(productBadges('one_of_one', [v(0)])).toEqual(['one_of_one', 'sold_out']);
  });
});
