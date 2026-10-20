import type { AgreedSpecData } from '@/components/commissions/AgreedSpec';
import { withUser } from '@/lib/db';
import type { SessionUser } from '@/lib/auth/session';
import type { FulfilmentStatus, ProductType } from '@/lib/domain/types';
import type { ClaimStatus } from '@/lib/domain/claims';
import type { StoredReturnPolicy } from '@/lib/returns/policy';
import type { ReturnStatus } from '@/lib/returns/status';

type Actor = Pick<SessionUser, 'id' | 'role'>;

export interface BuyerOrderItem {
  id: string;
  productId: string;
  productTitle: string;
  productSlug: string | null;
  variantLabel: string;
  quantity: number;
  lineTotalCents: number;
  imageUrl: string | null;
  productType: ProductType;
  fulfilmentStatus: FulfilmentStatus;
  reviewed: boolean;
  deliveredAt: Date | null;
  claimId: string | null;
  claimStatus: ClaimStatus | null;
  refundedCents: number;
  /** The returns policy the piece was sold under (copied at checkout). */
  returnPolicy: StoredReturnPolicy | null;
  /** Its latest change-of-mind return, if any. */
  returnId: string | null;
  returnNumber: string | null;
  returnStatus: ReturnStatus | null;
}

export interface BuyerFulfilment {
  id: string;
  makerId: string;
  makerName: string;
  makerSlug: string;
  /** "Melbourne VIC" */
  makerPlace: string;
  speed: string;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  estimatedDispatchDate: Date | null;
  leadDays: number | null;
  status: FulfilmentStatus;
  shippingCents: number;
  carrier: string | null;
  trackingNumber: string | null;
  estimatedDeliveryFrom: Date | null;
  estimatedDeliveryTo: Date | null;
  isMto: boolean;
  mtoStep: number;
  items: BuyerOrderItem[];
}

export interface BuyerOrder {
  id: string;
  orderNumber: string;
  status: string;
  totalCents: number;
  subtotalCents: number;
  shippingTotalCents: number;
  /** What the buyer saved on shipping (makers' bundle deals and Off One's shipping offer). */
  shippingSavingCents: number;
  refundedCents: number;
  createdAt: Date;
  paidAt: Date | null;
  shippingAddress: Record<string, string> | null;
  agreedSpec: AgreedSpecData | null;
  /** 'custom' for an accepted Have it made quote. */
  orderType: 'standard' | 'custom';
  milestones: Record<string, { at: string; photo?: string | null; note?: string | null }>;
  fulfilments: BuyerFulfilment[];
}

/** Buyer's orders, read through RLS (orders_select / fulfilments_select / order_items_select). */
export async function getBuyerOrders(user: Actor, orderRef?: string): Promise<BuyerOrder[]> {
  const byId = orderRef && /^[0-9a-f-]{36}$/i.test(orderRef);
  return withUser(user, async (db) => {
    const orders = await db<Omit<BuyerOrder, 'fulfilments'>[]>`
      select id, order_number, status, total_cents, subtotal_cents, shipping_total_cents, shipping_saving_cents, refunded_cents, created_at, paid_at,
             shipping_address, agreed_spec, order_type, milestones
      from public.orders
      where buyer_user_id = ${user.id} and status <> 'pending' and status <> 'failed'
        ${orderRef ? (byId ? db`and id = ${orderRef}` : db`and order_number = ${orderRef}`) : db``}
      order by created_at desc limit 100`;
    if (!orders.length) return [];
    const ids = orders.map((o) => o.id);
    const fulfilments = await db<(Omit<BuyerFulfilment, 'items'> & { orderId: string })[]>`
      select f.id, f.order_id, f.maker_id, m.display_name as maker_name, m.slug as maker_slug,
             concat_ws(' ', m.city, m.state) as maker_place,
             f.status, coalesce(f.buyer_shipping_cents, f.shipping_cents) as shipping_cents, f.carrier, f.speed, f.shipped_at, f.delivered_at, f.estimated_dispatch_date,
             f.tracking_number, f.estimated_delivery_from, f.estimated_delivery_to, f.mto_step,
             (select max(p.lead_time_days) from public.order_items oi join public.products p on p.id = oi.product_id
               where oi.fulfilment_id = f.id and oi.product_type = 'made_to_order')::int as lead_days,
             exists (select 1 from public.order_items oi where oi.fulfilment_id = f.id and oi.product_type = 'made_to_order') as is_mto
      from public.fulfilments f join public.makers m on m.id = f.maker_id
      where f.order_id in ${db(ids)} order by m.display_name`;
    const items = await db<(BuyerOrderItem & { fulfilmentId: string })[]>`
      select oi.id, oi.product_id, oi.fulfilment_id, oi.product_title, p.slug as product_slug, oi.variant_label, oi.quantity, oi.line_total_cents,
             oi.image_url, oi.product_type, oi.fulfilment_status,
             exists (select 1 from public.reviews r where r.order_item_id = oi.id) as reviewed,
             coalesce(oi.delivered_at, f.delivered_at) as delivered_at, c.id as claim_id, c.status as claim_status,
             oi.refunded_cents, oi.return_policy, rt.id as return_id, rt.number as return_number, rt.status as return_status
      from public.order_items oi
      join public.fulfilments f on f.id = oi.fulfilment_id
      left join public.products p on p.id = oi.product_id
      left join lateral (
        select rc.id, rc.status from public.return_claims rc
        where rc.order_item_id = oi.id order by rc.created_at desc limit 1
      ) c on true
      left join lateral (
        select r.id, r.number, r.status from public.returns r
        where r.order_item_id = oi.id order by r.requested_at desc limit 1
      ) rt on true
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

export interface SavedSizes {
  heightCm: string | null;
  bustCm: string | null;
  waistCm: string | null;
  hipsCm: string | null;
  insideLegCm: string | null;
  fitNotes: string | null;
  usualSize: string | null;
  fitPref: 'close' | 'true' | 'relaxed' | null;
}

/** Sizes & fit: measurements plus the usual size and fit preference. Null when nothing is saved. */
export async function getMeasurements(user: Actor): Promise<SavedSizes | null> {
  const [row] = await withUser(
    user,
    (db) => db<SavedSizes[]>`
    select m.height_cm, m.bust_cm, m.waist_cm, m.hips_cm, m.inside_leg_cm, m.fit_notes, p.usual_size, p.fit_pref
    from (select ${user.id}::uuid as user_id) u
    left join public.buyer_measurements m on m.user_id = u.user_id
    left join public.customer_prefs p on p.user_id = u.user_id`,
  );
  if (!row || Object.values(row).every((v) => v === null)) return null;
  return row;
}
