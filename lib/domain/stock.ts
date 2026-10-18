import type { ProductType } from './types';

export interface VariantStock {
  id: string;
  stockQuantity: number;
  isActive: boolean;
  lowStockThreshold: number;
}

export type Availability = 'in_stock' | 'low_stock' | 'sold_out';

export function variantAvailability(v: VariantStock): Availability {
  if (!v.isActive || v.stockQuantity <= 0) return 'sold_out';
  if (v.stockQuantity <= v.lowStockThreshold) return 'low_stock';
  return 'in_stock';
}

export type StockCheck = { ok: true } | { ok: false; reason: string };

/** Validates a requested quantity against stock, accounting for what's already in the bag. */
export function validateStock(
  variant: VariantStock,
  productType: ProductType,
  requestedQuantity: number,
  alreadyInCart = 0,
): StockCheck {
  if (!Number.isInteger(requestedQuantity) || requestedQuantity < 1) {
    return { ok: false, reason: 'Choose a quantity of at least 1.' };
  }
  if (variantAvailability(variant) === 'sold_out')
    return { ok: false, reason: 'This size is sold out.' };
  const total = requestedQuantity + alreadyInCart;
  if (productType === 'one_of_one' && total > 1) {
    return { ok: false, reason: 'This is a one-of-one piece — there is only one available.' };
  }
  if (total > 10) return { ok: false, reason: 'You can add up to 10 of a piece per order.' };
  if (total > variant.stockQuantity) {
    const left = variant.stockQuantity;
    return { ok: false, reason: `Only ${left} left in this size.` };
  }
  return { ok: true };
}

export type ProductBadge =
  | 'ready_to_ship'
  | 'made_to_order'
  | 'one_of_one'
  | 'low_stock'
  | 'sold_out';

export function productBadges(productType: ProductType, variants: VariantStock[]): ProductBadge[] {
  const badges: ProductBadge[] = [productType];
  const active = variants.filter((v) => v.isActive);
  const total = active.reduce((s, v) => s + Math.max(0, v.stockQuantity), 0);
  if (total === 0) badges.push('sold_out');
  else if (
    productType === 'ready_to_ship' &&
    active.some((v) => variantAvailability(v) === 'low_stock')
  ) {
    badges.push('low_stock');
  }
  return badges;
}

export const BADGE_LABELS: Record<ProductBadge, string> = {
  ready_to_ship: 'Ready to ship',
  made_to_order: 'Made to order',
  one_of_one: 'One of one',
  low_stock: 'Low stock',
  sold_out: 'Sold out',
};
