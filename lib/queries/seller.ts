import type { AgreedSpecData } from '@/components/commissions/AgreedSpec';
import { withUser } from '@/lib/db';
import type { SessionUser } from '@/lib/auth/session';
import type { FulfilmentStatus, ProductType } from '@/lib/domain/types';

type Seller = Pick<SessionUser, 'id' | 'role'> & { makerId: string };

export interface SellerMaker {
  id: string;
  slug: string;
  displayName: string;
  tagline: string | null;
  story: string | null;
  process: string | null;
  materials: string | null;
  sizingNotes: string | null;
  city: string | null;
  state: string | null;
  leadTimeDays: number;
  dispatchDays: number;
  shippingStandardCents: number;
  freeShippingOverCents: number | null;
  returnPolicy: string;
  customCommissionsEnabled: boolean;
  status: 'draft' | 'pending' | 'approved' | 'paused';
  rejectionReason: string | null;
  stripeAccountId: string | null;
  stripeOnboardingComplete: boolean;
  stripePayoutsEnabled: boolean;
  avatarUrl: string | null;
  coverUrl: string | null;
}

export async function getSellerMaker(s: Seller): Promise<SellerMaker> {
  const [m] = await withUser(
    s,
    (db) => db<SellerMaker[]>`
    select id, slug, display_name, tagline, story, process, materials, sizing_notes, city, state, lead_time_days, dispatch_days,
           shipping_standard_cents, free_shipping_over_cents, return_policy, custom_commissions_enabled, status, rejection_reason,
           stripe_account_id, stripe_onboarding_complete, stripe_payouts_enabled, avatar_url, cover_url
    from public.makers where id = ${s.makerId}`,
  );
  return m!;
}

export interface SellerListing {
  id: string;
  slug: string;
  title: string;
  status: string;
  productType: ProductType;
  priceCents: number;
  totalStock: number;
  imageUrl: string | null;
  rejectionReason: string | null;
  updatedAt: Date;
  viewCount: number;
  saveCount: number;
}

export async function getSellerListings(s: Seller): Promise<SellerListing[]> {
  return withUser(
    s,
    (db) => db<SellerListing[]>`
    select p.id, p.slug, p.title, p.status, p.product_type, p.price_cents, p.rejection_reason, p.updated_at, p.view_count, p.save_count,
           coalesce((select sum(stock_quantity) from public.product_variants v where v.product_id = p.id and v.is_active), 0)::int as total_stock,
           (select public_url from public.product_images i where i.product_id = p.id order by sort_order limit 1) as image_url
    from public.products p where p.maker_id = ${s.makerId}
    order by case p.status when 'rejected' then 0 when 'draft' then 1 when 'pending' then 2 when 'approved' then 3 else 4 end, p.updated_at desc`,
  );
}

export interface SellerOrder {
  id: string;
  orderId: string;
  orderNumber: string;
  status: FulfilmentStatus;
  createdAt: Date;
  buyerName: string | null;
  subtotalCents: number;
  shippingCents: number;
  platformCommissionCents: number;
  sellerNetCents: number;
  transferStatus: string;
  carrier: string | null;
  trackingNumber: string | null;
  estimatedDispatchDate: Date | null;
  estimatedDeliveryTo: Date | null;
  shippingAddress: Record<string, string> | null;
  buyerEmail: string;
  agreedSpec: AgreedSpecData | null;
  items: Array<{
    id: string;
    productTitle: string;
    variantLabel: string;
    quantity: number;
    lineTotalCents: number;
    imageUrl: string | null;
    productType: ProductType;
    fulfilmentStatus: FulfilmentStatus;
  }>;
}

/** The maker's fulfilments (RLS: fulfilments/orders/order_items policies scope to this maker). */
export async function getSellerOrders(s: Seller, fulfilmentId?: string): Promise<SellerOrder[]> {
  return withUser(s, async (db) => {
    const rows = await db<Omit<SellerOrder, 'items'>[]>`
      select f.id, f.order_id, o.order_number, f.status, f.created_at, o.buyer_name, f.subtotal_cents, f.shipping_cents,
             f.platform_commission_cents, f.seller_net_cents, f.transfer_status, f.carrier, f.tracking_number,
             f.estimated_dispatch_date, f.estimated_delivery_to, o.shipping_address, o.buyer_email, o.agreed_spec
      from public.fulfilments f join public.orders o on o.id = f.order_id
      where f.maker_id = ${s.makerId} and o.status not in ('pending', 'failed', 'cancelled')
        ${fulfilmentId ? db`and f.id = ${fulfilmentId}` : db``}
      order by case f.status when 'paid' then 0 when 'preparing' then 1 when 'shipped' then 2 else 3 end, f.created_at desc
      limit 200`;
    if (!rows.length) return [];
    const items = await db<(SellerOrder['items'][number] & { fulfilmentId: string })[]>`
      select id, fulfilment_id, product_title, variant_label, quantity, line_total_cents, image_url, product_type, fulfilment_status
      from public.order_items where fulfilment_id in ${db(rows.map((r) => r.id))}`;
    return rows.map((r) => ({ ...r, items: items.filter((i) => i.fulfilmentId === r.id) }));
  });
}

export interface SellerStats {
  views: number;
  saves: number;
  orders: number;
  revenueCents: number;
  grossCents: number;
  commissionCents: number;
  refundsCents: number;
  netCents: number;
  conversionRate: number;
  responseTimeHours: number;
  newOrders: number;
  unreadThreads: number;
  topProducts: Array<{
    id: string;
    title: string;
    slug: string;
    views: number;
    saves: number;
    orders: number;
    revenueCents: number;
  }>;
}

export async function getSellerStats(s: Seller, days = 30): Promise<SellerStats> {
  return withUser(s, async (db) => {
    const [row] = await db<Omit<SellerStats, 'topProducts' | 'conversionRate'>[]>`
      select
        (select count(*) from public.product_views v where v.maker_id = ${s.makerId} and v.created_at > now() - make_interval(days => ${days}))::int as views,
        (select coalesce(sum(save_count), 0) from public.products where maker_id = ${s.makerId})::int as saves,
        (select count(*) from public.fulfilments f join public.orders o on o.id = f.order_id
          where f.maker_id = ${s.makerId} and o.status not in ('pending','failed','cancelled') and f.created_at > now() - make_interval(days => ${days}))::int as orders,
        (select coalesce(sum(f.subtotal_cents), 0) from public.fulfilments f join public.orders o on o.id = f.order_id
          where f.maker_id = ${s.makerId} and o.status not in ('pending','failed','cancelled') and f.created_at > now() - make_interval(days => ${days}))::int as revenue_cents,
        (select coalesce(sum(f.subtotal_cents + f.shipping_cents), 0) from public.fulfilments f join public.orders o on o.id = f.order_id
          where f.maker_id = ${s.makerId} and o.status not in ('pending','failed','cancelled'))::int as gross_cents,
        (select coalesce(sum(f.platform_commission_cents), 0) from public.fulfilments f join public.orders o on o.id = f.order_id
          where f.maker_id = ${s.makerId} and o.status not in ('pending','failed','cancelled'))::int as commission_cents,
        (select coalesce(sum(oi.refunded_cents), 0) from public.order_items oi where oi.maker_id = ${s.makerId})::int as refunds_cents,
        ((select coalesce(sum(f.seller_net_cents), 0) from public.fulfilments f join public.orders o on o.id = f.order_id
          where f.maker_id = ${s.makerId} and o.status not in ('pending','failed','cancelled'))
         - (select coalesce(sum(round(oi.refunded_cents::numeric * oi.seller_net_cents / oi.line_total_cents)), 0)
            from public.order_items oi where oi.maker_id = ${s.makerId}))::int as net_cents,
        (select response_time_hours from public.makers where id = ${s.makerId}) as response_time_hours,
        (select count(*) from public.fulfilments f join public.orders o on o.id = f.order_id
          where f.maker_id = ${s.makerId} and f.status = 'paid' and o.status in ('paid','partially_refunded'))::int as new_orders,
        (select count(*) from public.message_threads t where t.maker_id = ${s.makerId}
          and t.last_message_at > coalesce(t.maker_last_read_at, 'epoch'))::int as unread_threads`;
    const top = await db<SellerStats['topProducts']>`
      select p.id, p.title, p.slug,
        (select count(*) from public.product_views v where v.product_id = p.id and v.created_at > now() - make_interval(days => ${days}))::int as views,
        p.save_count as saves,
        (select count(*) from public.order_items oi where oi.product_id = p.id)::int as orders,
        (select coalesce(sum(line_total_cents), 0) from public.order_items oi where oi.product_id = p.id)::int as revenue_cents
      from public.products p where p.maker_id = ${s.makerId} and p.status = 'approved'
      order by revenue_cents desc, views desc limit 5`;
    const r = row!;
    return { ...r, conversionRate: r.views ? r.orders / r.views : 0, topProducts: top };
  });
}

export async function getReplyTemplates(s: Seller) {
  return withUser(
    s,
    (db) => db<{ id: string; title: string; body: string }[]>`
    select id, title, body from public.reply_templates where maker_id = ${s.makerId} order by created_at`,
  );
}

export interface SellerCommission {
  id: string;
  garmentType: string;
  occasion: string | null;
  status: string;
  budgetMinCents: number;
  budgetMaxCents: number;
  deadlineDate: Date | null;
  measurements: string | null;
  fabricPreferences: string | null;
  colourPreferences: string | null;
  notes: string | null;
  inspirationImageUrls: string[];
  buyerName: string | null;
  createdAt: Date;
  agreedSpec: AgreedSpecData | null;
  agreedAt: Date | null;
}

export async function getSellerCommissions(s: Seller, id?: string) {
  return withUser(s, async (db) => {
    const requests = await db<SellerCommission[]>`
      select c.id, c.garment_type, c.occasion, c.status, c.budget_min_cents, c.budget_max_cents, c.deadline_date, c.measurements,
             c.fabric_preferences, c.colour_preferences, c.notes, c.inspiration_image_urls, c.created_at,
             c.agreed_spec, c.agreed_at, public.user_first_name(c.buyer_user_id) as buyer_name
      from public.commission_requests c
      where c.maker_id = ${s.makerId} ${id ? db`and c.id = ${id}` : db``}
      order by c.created_at desc`;
    const quotes = id
      ? await db`select id, total_price_cents, deposit_cents, production_days, revisions_included, shipping_cents,
                   estimated_delivery_date, message, status, created_at
                 from public.commission_quotes where commission_request_id = ${id} order by created_at desc`
      : [];
    return { requests, quotes };
  });
}

/** Daily product views for the maker over the last `days` days (zero-filled). */
export async function getDailyViews(
  s: Seller,
  days = 30,
): Promise<Array<{ day: string; views: number }>> {
  return withUser(
    s,
    (db) => db<{ day: string; views: number }[]>`
    select to_char(d, 'YYYY-MM-DD') as day,
           (select count(*) from public.product_views v
             where v.maker_id = ${s.makerId} and v.created_at >= d and v.created_at < d + interval '1 day')::int as views
    from generate_series(date_trunc('day', now()) - make_interval(days => ${days - 1}), date_trunc('day', now()), interval '1 day') d
    order by d`,
  );
}
