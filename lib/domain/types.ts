export type ProductType = 'ready_to_ship' | 'made_to_order' | 'one_of_one';
export type FulfilmentStatus =
  | 'paid'
  | 'preparing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

export interface CartLine {
  id?: string;
  productId: string;
  variantId: string;
  makerId: string;
  makerName: string;
  productTitle: string;
  productSlug?: string;
  variantLabel: string;
  productType: ProductType;
  imageUrl?: string | null;
  quantity: number;
  unitPriceCents: number;
  leadTimeDays?: number | null;
}

export interface MakerShipping {
  makerId: string;
  shippingStandardCents: number;
  freeShippingOverCents: number | null;
  dispatchDays: number;
}
