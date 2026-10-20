import type { SessionUser } from '@/lib/auth/session';
import { sql } from '@/lib/db';
import { TERMS } from '@/lib/studio/terms';
import { TO_SHIP } from './studio';

type Seller = Pick<SessionUser, 'id' | 'makerId'>;

const TZ = 'Australia/Melbourne';
/** Start of this/last month and week in Melbourne, as SQL timestamptz expressions. */
const THIS_MONTH = `date_trunc('month', now() at time zone '${TZ}') at time zone '${TZ}'`;
const LAST_MONTH = `(date_trunc('month', now() at time zone '${TZ}') - interval '1 month') at time zone '${TZ}'`;
const SOLD = `o.status in ('paid', 'partially_refunded') and f.status::text not in ('refunded', 'cancelled')`;

export interface ChecklistItem {
  key: 'payouts' | 'pieces' | 'shipping' | 'lead';
  label: string;
  done: boolean;
  href: string;
}

export interface NeedsRow {
  id: string;
  kind: 'ship' | 'message' | 'custom';
  title: string;
  sub: string;
  tag: string;
  urgent: boolean;
  href: string;
  imageUrl: string | null;
  sort: number;
}

export interface Overview {
  foundingNumber: number | null;
  foundingUntil: Date | null;
  checklist: ChecklistItem[];
  kpi: {
    salesThisMonth: number;
    salesLastMonth: number;
    ordersThisMonth: number;
    toShip: number;
    oldestDueToday: boolean;
    viewsThisMonth: number;
    savesThisMonth: number;
    commissionThisMonth: number;
  };
  needs: NeedsRow[];
  weekly: Array<{ weekStart: string; cents: number }>;
  topPieces: Array<{
    id: string;
    title: string;
    imageUrl: string | null;
    sold: number;
    saves: number;
  }>;
  lowStock: Array<{
    variantId: string;
    productId: string;
    title: string;
    size: string;
    stock: number;
    imageUrl: string | null;
  }>;
  toShipList: Array<{
    id: string;
    orderNumber: string;
    title: string;
    variantLabel: string;
    buyerName: string | null;
    shipBy: string | null;
    imageUrl: string | null;
    readyToShip: boolean;
  }>;
  payout: { nextAmount: number; nextDate: string; onTheWay: number; bank: string | null };
}

/** The date (YYYY-MM-DD) of the next payout weekday in Melbourne, today included. */
export function nextPayoutDate(now = new Date()): string {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const target = days.indexOf(TERMS.payoutWeekday);
  const local = new Date(
    new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now) + 'T00:00:00Z',
  );
  const add = (target - local.getUTCDay() + 7) % 7;
  local.setUTCDate(local.getUTCDate() + add);
  return local.toISOString().slice(0, 10);
}

export async function getOverview(seller: Seller): Promise<Overview> {
  const makerId = seller.makerId!;
  const db = sql();
  const [shop] = await db<
    {
      foundingNumber: number | null;
      foundingUntil: Date | null;
      chargesEnabled: boolean;
      mtoDefaultLead: string | null;
      bankName: string | null;
      bankLast4: string | null;
      hasRates: boolean;
      unchecked: number;
      hasMto: boolean;
    }[]
  >`
    select m.founding_number, m.founding_until, m.stripe_charges_enabled as charges_enabled, m.mto_default_lead,
      m.bank_name, m.bank_last4,
      exists (select 1 from public.maker_shipping_rates r where r.maker_id = m.id and r.region = 'au' and r.enabled) as has_rates,
      (select count(*) from public.products p where p.maker_id = m.id and p.listed_by_admin and p.reviewed_by_seller_at is null)::int as unchecked,
      exists (select 1 from public.products p where p.maker_id = m.id and p.product_type = 'made_to_order') as has_mto
    from public.makers m where m.id = ${makerId}`;

  const [kpi] = await db<Overview['kpi'][]>`
    select
      coalesce(sum(f.subtotal_cents + f.shipping_cents) filter (where o.paid_at >= ${db.unsafe(THIS_MONTH)}), 0)::int as sales_this_month,
      coalesce(sum(f.subtotal_cents + f.shipping_cents) filter (where o.paid_at >= ${db.unsafe(LAST_MONTH)} and o.paid_at < ${db.unsafe(THIS_MONTH)}), 0)::int as sales_last_month,
      count(*) filter (where o.paid_at >= ${db.unsafe(THIS_MONTH)})::int as orders_this_month,
      coalesce(sum(f.platform_commission_cents) filter (where o.paid_at >= ${db.unsafe(THIS_MONTH)}), 0)::int as commission_this_month,
      count(*) filter (where f.status in ${db.unsafe(TO_SHIP)})::int as to_ship,
      coalesce(bool_or(f.status in ${db.unsafe(TO_SHIP)} and f.estimated_dispatch_date <= (now() at time zone ${TZ})::date), false) as oldest_due_today,
      (select count(*) from public.product_views v where v.maker_id = ${makerId} and v.created_at >= ${db.unsafe(THIS_MONTH)})::int as views_this_month,
      (select count(*) from public.saved_items s join public.products p on p.id = s.product_id
        where p.maker_id = ${makerId} and s.created_at >= ${db.unsafe(THIS_MONTH)})::int as saves_this_month
    from public.fulfilments f join public.orders o on o.id = f.order_id
    where f.maker_id = ${makerId} and ${db.unsafe(SOLD)}`;

  const toShipList = await db<Overview['toShipList']>`
    select f.id, o.order_number, first.product_title as title, first.variant_label, o.buyer_name, first.image_url,
      to_char(f.estimated_dispatch_date, 'YYYY-MM-DD') as ship_by,
      (f.status::text in ('ready', 'preparing') or (f.status = 'paid' and not exists (
        select 1 from public.order_items oi where oi.fulfilment_id = f.id and oi.product_type = 'made_to_order'))) as ready_to_ship
    from public.fulfilments f join public.orders o on o.id = f.order_id
    left join lateral (select product_title, variant_label, image_url from public.order_items oi
      where oi.fulfilment_id = f.id order by created_at limit 1) first on true
    where f.maker_id = ${makerId} and f.status in ${db.unsafe(TO_SHIP)} and o.status in ('paid', 'partially_refunded')
    order by f.estimated_dispatch_date nulls last, o.paid_at limit 20`;

  const threads = await db<
    {
      id: string;
      buyerName: string | null;
      title: string | null;
      dueAt: Date | null;
      imageUrl: string | null;
    }[]
  >`
    select t.id, public.user_first_name(t.buyer_user_id) as buyer_name, t.context->>'productTitle' as title,
      t.reply_due_at as due_at, t.context->>'imageUrl' as image_url
    from public.message_threads t where t.maker_id = ${makerId} and t.maker_needs_reply
    order by t.reply_due_at nulls last limit 10`;

  const customs = await db<
    {
      id: string;
      garment: string;
      buyerName: string | null;
      createdAt: Date;
      budgetMax: number;
      replyBy: Date | null;
    }[]
  >`
    select r.id, r.kind as garment, case when r.anonymous then null else public.user_first_name(r.buyer_id) end as buyer_name,
      x.created_at, coalesce(r.budget_max, r.budget_min, 0) * 100 as budget_max, x.reply_by
    from public.custom_request_recipients x join public.custom_requests r on r.id = x.request_id
    where x.maker_id = ${makerId} and x.status = 'pending' and r.status in ('sent', 'quoted')
    order by x.reply_by limit 10`;

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  const needs: NeedsRow[] = [];
  for (const o of toShipList) {
    const due = o.shipBy ?? today;
    const diff = Math.round((Date.parse(due) - Date.parse(today)) / 86_400_000);
    needs.push({
      id: `ship-${o.id}`,
      kind: 'ship',
      title: `${o.title} · ${o.variantLabel.replace(/^AU /, 'Size ')}`,
      sub: `#${o.orderNumber.replace(/^OO-/, '')} for ${o.buyerName ?? 'a guest'}`,
      tag: o.readyToShip
        ? diff < 0
          ? 'Overdue'
          : diff === 0
            ? 'Ship today'
            : diff === 1
              ? 'Ship tomorrow'
              : `Ship in ${diff} days`
        : 'Making',
      urgent: o.readyToShip && diff <= 0,
      href: `/studio/orders?tab=${o.readyToShip ? 'to-ship' : 'mto'}&order=${o.id}`,
      imageUrl: o.imageUrl,
      sort: diff * 24,
    });
  }
  for (const t of threads) {
    const hours = t.dueAt ? (new Date(t.dueAt).getTime() - Date.now()) / 3_600_000 : 24;
    needs.push({
      id: `msg-${t.id}`,
      kind: 'message',
      title: `${t.buyerName ?? 'A buyer'} is waiting for a reply`,
      sub: t.title ? `About ${t.title}` : 'General question',
      tag:
        hours <= 0
          ? 'Reply overdue'
          : hours < 1
            ? 'Reply within the hour'
            : `Reply within ${Math.ceil(hours)}h`,
      urgent: hours <= 1,
      href: `/studio/messages/${t.id}`,
      imageUrl: t.imageUrl,
      sort: hours,
    });
  }
  for (const c of customs) {
    const left = c.replyBy ? (new Date(c.replyBy).getTime() - Date.now()) / 3_600_000 : 48;
    needs.push({
      id: `custom-${c.id}`,
      kind: 'custom',
      title: `Custom ${c.garment.replace(/_/g, ' ')} for ${c.buyerName ?? 'a buyer'}`,
      sub: `Budget up to A$${Math.round(c.budgetMax / 100)}`,
      tag: left <= 0 ? 'Reply time passed' : `Quote within ${Math.ceil(left)}h`,
      urgent: left <= 12,
      href: `/studio/requests?id=${c.id}`,
      imageUrl: null,
      sort: left,
    });
  }
  needs.sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.sort - b.sort);

  const weekly = await db<Overview['weekly']>`
    with weeks as (
      select generate_series(
        date_trunc('week', now() at time zone ${TZ}) - interval '7 weeks',
        date_trunc('week', now() at time zone ${TZ}), interval '1 week') as week_start
    )
    select to_char(w.week_start, 'YYYY-MM-DD') as week_start,
      coalesce((select sum(f.subtotal_cents + f.shipping_cents) from public.fulfilments f join public.orders o on o.id = f.order_id
        where f.maker_id = ${makerId} and ${db.unsafe(SOLD)}
          and (o.paid_at at time zone ${TZ}) >= w.week_start and (o.paid_at at time zone ${TZ}) < w.week_start + interval '1 week'), 0)::int as cents
    from weeks w order by w.week_start`;

  const topPieces = await db<Overview['topPieces']>`
    select p.id, p.title,
      (select public_url from public.product_images i where i.product_id = p.id order by sort_order limit 1) as image_url,
      coalesce((select sum(oi.quantity) from public.order_items oi join public.orders o on o.id = oi.order_id
        where oi.product_id = p.id and o.status in ('paid', 'partially_refunded') and o.paid_at > now() - interval '90 days'), 0)::int as sold,
      (select count(*) from public.saved_items s where s.product_id = p.id)::int as saves
    from public.products p where p.maker_id = ${makerId} and p.status = 'approved'
    order by sold desc, saves desc limit 4`;

  const lowStock = await db<Overview['lowStock']>`
    select v.id as variant_id, p.id as product_id, p.title, v.size, v.stock_quantity as stock,
      (select public_url from public.product_images i where i.product_id = p.id order by sort_order limit 1) as image_url
    from public.product_variants v join public.products p on p.id = v.product_id
    where p.maker_id = ${makerId} and p.status = 'approved' and p.product_type = 'ready_to_ship' and v.is_active
      and v.stock_quantity <= 1
    order by v.stock_quantity, p.title limit 8`;

  const [money] = await db<{ next: number; onTheWay: number }[]>`
    select
      coalesce(sum(f.seller_net_cents) filter (where f.transfer_released_at is not null and f.transfer_released_at >
        coalesce((select max(created_at) from public.payouts po where po.maker_id = ${makerId} and po.status = 'paid'), 'epoch')), 0)::int as next,
      coalesce(sum(f.seller_net_cents) filter (where f.transfer_released_at is null and f.status::text not in ('refunded', 'cancelled')), 0)::int as on_the_way
    from public.fulfilments f join public.orders o on o.id = f.order_id
    where f.maker_id = ${makerId} and o.status in ('paid', 'partially_refunded')`;

  const checklist: ChecklistItem[] = [
    {
      key: 'payouts',
      label: 'Connect payouts',
      done: shop!.chargesEnabled,
      href: '/studio/settings#payouts',
    },
    {
      key: 'pieces',
      label: 'Check the pieces we listed for you',
      done: shop!.unchecked === 0,
      href: '/studio/listings',
    },
    {
      key: 'shipping',
      label: 'Set your shipping prices',
      done: shop!.hasRates,
      href: '/studio/settings#shipping',
    },
    {
      key: 'lead',
      label: 'Add your made-to-order lead time',
      done: Boolean(shop!.mtoDefaultLead) || !shop!.hasMto,
      href: '/studio/settings#made-to-order',
    },
  ];

  return {
    foundingNumber: shop!.foundingNumber,
    foundingUntil: shop!.foundingUntil,
    checklist,
    kpi: kpi!,
    needs: needs.slice(0, 8),
    weekly,
    topPieces,
    lowStock,
    toShipList: toShipList.filter((o) => o.readyToShip),
    payout: {
      nextAmount: money!.next,
      nextDate: nextPayoutDate(),
      onTheWay: money!.onTheWay,
      bank: shop!.bankName
        ? `${shop!.bankName}${shop!.bankLast4 ? ` ••${shop!.bankLast4}` : ''}`
        : null,
    },
  };
}
