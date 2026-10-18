import { formatPrice } from './money';
import type { ProductType } from './types';

export type SavedAlertKind = 'price_drop' | 'low_stock' | 'back_in_size' | 'info';

export interface SavedStatusInput {
  priceCents: number;
  priceAtSave: number | null;
  productType: ProductType;
  totalStock: number;
  leadTimeDays: number | null;
  /** A size that was sold out when this shopper looked at it is back in stock. */
  backInSize: boolean;
}

export interface SavedStatus {
  kind: SavedAlertKind;
  text: string;
  /** Price drops and low stock are worth interrupting for; the rest is context. */
  urgent: boolean;
}

/** The one line under a saved piece, most important change first. */
export function savedStatus(i: SavedStatusInput): SavedStatus {
  if (i.priceAtSave && i.priceCents < i.priceAtSave)
    return {
      kind: 'price_drop',
      text: `Price drop · was ${formatPrice(i.priceAtSave)}`,
      urgent: true,
    };
  if (i.productType === 'ready_to_ship' && i.totalStock > 0 && i.totalStock <= 2)
    return { kind: 'low_stock', text: `Only ${i.totalStock} left`, urgent: true };
  if (i.backInSize) return { kind: 'back_in_size', text: 'Back in your size', urgent: false };
  if (i.productType === 'made_to_order')
    return {
      kind: 'info',
      text: i.leadTimeDays ? `Made to order · ${i.leadTimeDays} days` : 'Made to order',
      urgent: false,
    };
  if (i.totalStock <= 0) return { kind: 'info', text: 'Sold out', urgent: false };
  if (i.productType === 'one_of_one') return { kind: 'info', text: 'One of one', urgent: false };
  return { kind: 'info', text: 'Ready to ship', urgent: false };
}

/** The single alert worth surfacing above the grid: any price drop beats any low stock. */
export function topAlert<T extends { status: SavedStatus }>(items: T[]): T | undefined {
  return (
    items.find((i) => i.status.kind === 'price_drop') ??
    items.find((i) => i.status.kind === 'low_stock')
  );
}
