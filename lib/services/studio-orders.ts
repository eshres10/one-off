import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import { sql, withUser, type Db } from '@/lib/db';
import { sendEmail } from '@/lib/email/send';
import { emails } from '@/lib/email/templates';
import { CARRIERS, trackingError, trackingUrl, type Carrier } from '@/lib/studio/carriers';
import { UserError } from './errors';

export {
  CARRIERS,
  carrierLabel,
  trackingError,
  trackingUrl,
  type Carrier,
} from '@/lib/studio/carriers';

type Seller = Pick<SessionUser, 'id' | 'role' | 'makerId'>;

export const ORDER_TABS = [
  { key: 'to-ship', label: 'To ship' },
  { key: 'mto', label: 'Made to order' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'completed', label: 'Completed' },
  { key: 'all', label: 'All' },
] as const;
export type OrderTab = (typeof ORDER_TABS)[number]['key'];

export const MAKING_STEPS = ['Ordered', 'Cutting', 'Sewing', 'Ready'] as const;

const MTO = `exists (select 1 from public.order_items oi where oi.fulfilment_id = f.id and oi.product_type = 'made_to_order')`;

const TAB_SQL: Record<OrderTab, string> = {
  'to-ship': `(f.status in ('ready', 'preparing') or (f.status = 'paid' and not ${MTO}))`,
  mto: `(${MTO} and f.status in ('paid', 'making'))`,
  shipped: `f.status = 'shipped'`,
  completed: `f.status in ('delivered', 'completed')`,
  all: 'true',
};

export interface StudioOrderRow {
  id: string;
  orderNumber: string;
  placedAt: Date;
  title: string;
  variantLabel: string;
  imageUrl: string | null;
  itemCount: number;
  buyerName: string | null;
  suburb: string | null;
  state: string | null;
  shipBy: string | null;
  totalCents: number;
  status: string;
  isMto: boolean;
  mtoStep: number;
}

const ROW = `
  f.id, o.order_number, coalesce(o.paid_at, o.created_at) as placed_at,
  first.product_title as title, first.variant_label, first.image_url,
  (select count(*) from public.order_items oi where oi.fulfilment_id = f.id)::int as item_count,
  o.buyer_name, o.shipping_address->>'city' as suburb, o.shipping_address->>'state' as state,
  to_char(f.estimated_dispatch_date, 'YYYY-MM-DD') as ship_by, (f.subtotal_cents + f.shipping_cents) as total_cents,
  f.status::text as status, ${MTO} as is_mto, f.mto_step`;
const FROM = `
  from public.fulfilments f join public.order_summaries o on o.id = f.order_id
  left join lateral (select oi.product_title, oi.variant_label, oi.image_url from public.order_items oi
    where oi.fulfilment_id = f.id order by oi.created_at, oi.id limit 1) first on true`;

/** The maker's orders for a tab, read through RLS. */
export async function listStudioOrders(seller: Seller, tab: OrderTab): Promise<StudioOrderRow[]> {
  return withUser(
    seller,
    (db) =>
      db<StudioOrderRow[]>`
      select ${db.unsafe(ROW)} ${db.unsafe(FROM)}
      where f.maker_id = ${seller.makerId!} and o.status in ('paid', 'partially_refunded', 'refunded')
        and ${db.unsafe(TAB_SQL[tab])}
      order by ${db.unsafe(tab === 'to-ship' || tab === 'mto' ? 'f.estimated_dispatch_date asc nulls last, placed_at' : 'placed_at desc')}
      limit 200`,
  );
}

export async function countStudioOrders(seller: Seller): Promise<Record<OrderTab, number>> {
  const [row] = await withUser(
    seller,
    (db) =>
      db<Record<OrderTab, number>[]>`
      select
        ${db.unsafe(
          ORDER_TABS.map(
            (t) => `count(*) filter (where ${TAB_SQL[t.key]})::int as "${t.key}"`,
          ).join(', '),
        )}
      from public.fulfilments f join public.order_summaries o on o.id = f.order_id
      where f.maker_id = ${seller.makerId!} and o.status in ('paid', 'partially_refunded', 'refunded')`,
  );
  return row!;
}

export interface StudioOrderDetail extends StudioOrderRow {
  orderId: string;
  buyerUserId: string | null;
  shipTo: Record<string, string> | null;
  shippingCents: number;
  shippingMethod: string | null;
  subtotalCents: number;
  commissionPct: number;
  commissionCents: number;
  processingFeeCents: number;
  sellerNetCents: number;
  giftNote: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  transferReleasedAt: Date | null;
  items: Array<{
    id: string;
    productId: string;
    productSlug: string | null;
    title: string;
    variantLabel: string;
    productType: string;
    quantity: number;
    imageUrl: string | null;
    lineTotalCents: number;
    customMeasurements: Record<string, string> | null;
  }>;
  claim: { id: string; status: string } | null;
}

export async function getStudioOrder(
  seller: Seller,
  fulfilmentId: string,
): Promise<StudioOrderDetail | null> {
  return withUser(seller, async (db) => {
    const [row] = await db<
      (Omit<StudioOrderDetail, 'items' | 'claim'> & { commissionPct: string })[]
    >`
      select ${db.unsafe(ROW)}, o.id as order_id, o.buyer_user_id, o.shipping_address as ship_to,
        f.shipping_cents, f.shipping_method, f.subtotal_cents, coalesce(f.commission_pct_applied, 15) as commission_pct,
        f.platform_commission_cents as commission_cents, f.processing_fee_cents, f.seller_net_cents, o.gift_note,
        f.carrier, f.tracking_number, f.shipped_at, f.delivered_at, f.transfer_released_at
      ${db.unsafe(FROM)}
      where f.id = ${fulfilmentId} and f.maker_id = ${seller.makerId!}`;
    if (!row) return null;
    const items = await db<StudioOrderDetail['items']>`
      select oi.id, oi.product_id, p.slug as product_slug, oi.product_title as title, oi.variant_label, oi.product_type,
        oi.quantity, oi.image_url, oi.line_total_cents, oi.custom_measurements
      from public.order_items oi left join public.products p on p.id = oi.product_id
      where oi.fulfilment_id = ${fulfilmentId} order by oi.created_at`;
    const [claim] = await db<{ id: string; status: string }[]>`
      select c.id, c.status from public.return_claims c join public.order_items oi on oi.id = c.order_item_id
      where oi.fulfilment_id = ${fulfilmentId} order by c.created_at desc limit 1`;
    return { ...row, commissionPct: Number(row.commissionPct), items, claim: claim ?? null };
  });
}

async function lockOwn(db: Db, seller: Seller, fulfilmentId: string) {
  const [f] = await db<
    {
      id: string;
      status: string;
      orderId: string;
      orderStatus: string;
      isMto: boolean;
      mtoStep: number;
    }[]
  >`
    select f.id, f.status::text as status, f.order_id, o.status as order_status, ${db.unsafe(MTO)} as is_mto, f.mto_step
    from public.fulfilments f join public.order_summaries o on o.id = f.order_id
    where f.id = ${fulfilmentId} and f.maker_id = ${seller.makerId!} for update of f`;
  if (!f) throw new UserError('Order not found.');
  if (!['paid', 'partially_refunded'].includes(f.orderStatus))
    throw new UserError('This order has been refunded or cancelled.');
  return f;
}

async function buyerContact(fulfilmentId: string) {
  const [info] = await sql()<
    {
      email: string;
      name: string | null;
      orderId: string;
      orderNumber: string;
      makerName: string;
      title: string;
    }[]
  >`
    select o.buyer_email as email, o.buyer_name as name, o.id as order_id, o.order_number, m.display_name as maker_name,
      (select product_title from public.order_items where fulfilment_id = f.id order by created_at limit 1) as title
    from public.fulfilments f join public.orders o on o.id = f.order_id join public.makers m on m.id = f.maker_id
    where f.id = ${fulfilmentId}`;
  return info!;
}

export const firstName = (name: string | null | undefined) =>
  (name ?? '').trim().split(/\s+/)[0] || 'The buyer';

/**
 * Made-to-order progress: Ordered → Cutting → Sewing → Ready. The buyer sees it on their order
 * page and gets an email when it reaches Sewing and Ready.
 */
export async function setMakingStep(seller: Seller, fulfilmentId: string, step: number) {
  if (!Number.isInteger(step) || step < 0 || step >= MAKING_STEPS.length)
    throw new UserError('Choose a making step.');
  const before = await withUser(seller, async (db) => {
    const f = await lockOwn(db, seller, fulfilmentId);
    if (!f.isMto) throw new UserError('Making steps are for made-to-order pieces.');
    if (!['paid', 'making', 'ready', 'preparing'].includes(f.status))
      throw new UserError('This piece has already been shipped.');
    const status = step === 3 ? 'ready' : step === 0 ? 'paid' : 'making';
    await db`update public.fulfilments set mto_step = ${step}, status = ${status}::fulfilment_status where id = ${f.id}`;
    await db`
      update public.order_items set fulfilment_status = ${step === 0 ? 'paid' : 'preparing'}::fulfilment_status
      where fulfilment_id = ${f.id} and fulfilment_status in ('paid', 'preparing')`;
    return f.mtoStep;
  });
  await audit(
    'fulfilment.making_step',
    { type: 'fulfilment', id: fulfilmentId },
    { step },
    seller.id,
  );
  if (step > before && (step === 2 || step === 3)) {
    const b = await buyerContact(fulfilmentId);
    await sendEmail(
      emails.makingUpdate(
        b.email,
        { id: b.orderId, orderNumber: b.orderNumber },
        b.makerName,
        b.title,
        step === 3,
      ),
    );
  }
}

/** Marks the maker's part of an order shipped and emails the buyer the tracking link. */
export async function markShipped(
  seller: Seller,
  input: { fulfilmentId: string; carrier: Carrier; trackingNumber: string },
): Promise<{ buyerFirstName: string }> {
  if (!(input.carrier in CARRIERS)) throw new UserError('Choose how it’s being sent.');
  const tracking = input.trackingNumber.replace(/\s+/g, '').toUpperCase();
  const problem = trackingError(input.carrier, tracking);
  if (problem) throw new UserError(problem);
  await withUser(seller, async (db) => {
    const f = await lockOwn(db, seller, input.fulfilmentId);
    if (!['paid', 'preparing', 'making', 'ready'].includes(f.status))
      throw new UserError(`This order is already ${f.status}.`);
    const t = input.carrier === 'hand' ? null : tracking;
    await db`
      update public.fulfilments set status = 'shipped', carrier = ${input.carrier}, tracking_number = ${t},
        shipped_at = now(), mto_step = case when ${f.isMto} then 3 else mto_step end
      where id = ${f.id}`;
    await db`
      update public.order_items set fulfilment_status = 'shipped', carrier = ${input.carrier}, tracking_number = ${t},
        shipped_at = now()
      where fulfilment_id = ${f.id} and fulfilment_status <> 'refunded'`;
  });
  await audit(
    'fulfilment.shipped',
    { type: 'fulfilment', id: input.fulfilmentId },
    { carrier: input.carrier },
    seller.id,
  );
  const b = await buyerContact(input.fulfilmentId);
  await sendEmail(
    emails.orderShipped(
      b.email,
      { id: b.orderId, orderNumber: b.orderNumber },
      b.makerName,
      CARRIERS[input.carrier].label,
      input.carrier === 'hand' ? '' : tracking,
      trackingUrl(input.carrier, tracking),
    ),
  );
  return { buyerFirstName: firstName(b.name) };
}

/** Finds or opens the conversation with this order's buyer about the piece. */
export async function openOrderThread(seller: Seller, fulfilmentId: string): Promise<string> {
  const order = await getStudioOrder(seller, fulfilmentId);
  if (!order) throw new UserError('Order not found.');
  if (!order.buyerUserId)
    throw new UserError('This buyer checked out as a guest, so they can’t be messaged here.');
  const item = order.items[0]!;
  const [existing] = await sql()<{ id: string }[]>`
    select id from public.message_threads
    where buyer_user_id = ${order.buyerUserId} and maker_id = ${seller.makerId!} and product_id = ${item.productId}
      and commission_request_id is null`;
  if (existing) return existing.id;
  const context = {
    productId: item.productId,
    productTitle: item.title,
    productSlug: item.productSlug,
    imageUrl: item.imageUrl,
    priceCents: item.lineTotalCents,
    productType: item.productType,
    variantLabel: item.variantLabel,
    orderNumber: order.orderNumber,
  };
  const [created] = await sql()<{ id: string }[]>`
    insert into public.message_threads (buyer_user_id, maker_id, product_id, context, kind)
    values (${order.buyerUserId}, ${seller.makerId!}, ${item.productId}, ${sql().json(context as never)}, 'enquiry')
    returning id`;
  return created!.id;
}
