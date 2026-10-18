import { withUser } from '@/lib/db';
import type { SessionUser } from '@/lib/auth/session';
import type { FulfilmentStatus, ProductType } from '@/lib/domain/types';

type Actor = Pick<SessionUser, 'id' | 'role'>;

export interface BuyerOrderItem {
  id: string;
  productTitle: string;
  productSlug: string | null;
  variantLabel: string;
  quantity: number;
  lineTotalCents: number;
  imageUrl: string | null;
  productType: ProductType;
  fulfilmentStatus: FulfilmentStatus;
  reviewed: boolean;
}

export interface BuyerFulfilment {
  id: string;
  makerName: string;
  makerSlug: string;
  status: FulfilmentStatus;
  shippingCents: number;
  carrier: string | null;
  trackingNumber: string | null;
  estimatedDeliveryFrom: Date | null;
  estimatedDeliveryTo: Date | null;
  items: BuyerOrderItem[];
}

export interface BuyerOrder {
  id: string;
  orderNumber: string;
  status: string;
  totalCents: number;
  subtotalCents: number;
  shippingTotalCents: number;
  refundedCents: number;
  createdAt: Date;
  shippingAddress: Record<string, string> | null;
  fulfilments: BuyerFulfilment[];
}

/** Buyer's orders, read through RLS (orders_select / fulfilments_select / order_items_select). */
export async function getBuyerOrders(user: Actor, orderId?: string): Promise<BuyerOrder[]> {
  return withUser(user, async (db) => {
    const orders = await db<Omit<BuyerOrder, 'fulfilments'>[]>`
      select id, order_number, status, total_cents, subtotal_cents, shipping_total_cents, refunded_cents, created_at, shipping_address
      from public.orders
      where buyer_user_id = ${user.id} and status <> 'pending' and status <> 'failed'
        ${orderId ? db`and id = ${orderId}` : db``}
      order by created_at desc limit 100`;
    if (!orders.length) return [];
    const ids = orders.map((o) => o.id);
    const fulfilments = await db<(Omit<BuyerFulfilment, 'items'> & { orderId: string })[]>`
      select f.id, f.order_id, m.display_name as maker_name, m.slug as maker_slug, f.status, f.shipping_cents, f.carrier,
             f.tracking_number, f.estimated_delivery_from, f.estimated_delivery_to
      from public.fulfilments f join public.makers m on m.id = f.maker_id
      where f.order_id in ${db(ids)} order by m.display_name`;
    const items = await db<(BuyerOrderItem & { fulfilmentId: string })[]>`
      select oi.id, oi.fulfilment_id, oi.product_title, p.slug as product_slug, oi.variant_label, oi.quantity, oi.line_total_cents,
             oi.image_url, oi.product_type, oi.fulfilment_status,
             exists (select 1 from public.reviews r where r.order_item_id = oi.id) as reviewed
      from public.order_items oi left join public.products p on p.id = oi.product_id
      where oi.order_id in ${db(ids)}`;
    return orders.map((o) => ({
      ...o,
      fulfilments: fulfilments
        .filter((f) => f.orderId === o.id)
        .map(({ orderId: _o, ...f }) => ({
          ...f,
          items: items.filter((i) => i.fulfilmentId === f.id),
        })),
    }));
  });
}

export async function getFollowedMakers(user: Actor) {
  return withUser(
    user,
    (db) => db<
      {
        id: string;
        slug: string;
        displayName: string;
        city: string | null;
        avatarUrl: string | null;
        tagline: string | null;
      }[]
    >`
    select m.id, m.slug, m.display_name, m.city, m.avatar_url, m.tagline
    from public.maker_follows f join public.makers m on m.id = f.maker_id
    where f.user_id = ${user.id} order by f.created_at desc`,
  );
}

export async function getSavedIds(user: Actor) {
  const rows = await withUser(
    user,
    (db) => db<{ productId: string }[]>`
    select product_id from public.saved_items where user_id = ${user.id} order by created_at desc`,
  );
  return rows.map((r) => r.productId);
}

export async function getMeasurements(user: Actor) {
  const [row] = await withUser(
    user,
    (db) => db<
      {
        heightCm: string | null;
        bustCm: string | null;
        waistCm: string | null;
        hipsCm: string | null;
        fitNotes: string | null;
      }[]
    >`
    select height_cm, bust_cm, waist_cm, hips_cm, fit_notes from public.buyer_measurements where user_id = ${user.id}`,
  );
  return row ?? null;
}

export interface BuyerCommission {
  id: string;
  garmentType: string;
  occasion: string | null;
  status: string;
  budgetMinCents: number;
  budgetMaxCents: number;
  deadlineDate: Date | null;
  makerName: string | null;
  makerSlug: string | null;
  createdAt: Date;
  measurements: string | null;
  fabricPreferences: string | null;
  colourPreferences: string | null;
  notes: string | null;
  inspirationImageUrls: string[];
}

export interface QuoteView {
  id: string;
  totalPriceCents: number;
  depositCents: number;
  productionDays: number;
  revisionsIncluded: number;
  shippingCents: number;
  estimatedDeliveryDate: Date | null;
  message: string | null;
  status: string;
  createdAt: Date;
}

export async function getBuyerCommissions(user: Actor, id?: string) {
  return withUser(user, async (db) => {
    const requests = await db<BuyerCommission[]>`
      select c.id, c.garment_type, c.occasion, c.status, c.budget_min_cents, c.budget_max_cents, c.deadline_date, c.created_at,
             c.measurements, c.fabric_preferences, c.colour_preferences, c.notes, c.inspiration_image_urls,
             m.display_name as maker_name, m.slug as maker_slug
      from public.commission_requests c left join public.makers m on m.id = c.maker_id
      where c.buyer_user_id = ${user.id} ${id ? db`and c.id = ${id}` : db``}
      order by c.created_at desc`;
    const quotes = id
      ? await db<QuoteView[]>`
          select id, total_price_cents, deposit_cents, production_days, revisions_included, shipping_cents, estimated_delivery_date,
                 message, status, created_at
          from public.commission_quotes where commission_request_id = ${id} order by created_at desc`
      : [];
    return { requests, quotes };
  });
}
