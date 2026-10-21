import { sql } from '@/lib/db';
const TZ = 'Australia/Melbourne';

const SOLD = `o.status in ('paid', 'partially_refunded') and f.status::text not in ('refunded', 'cancelled')`;

export interface TodayStats {
  /** Seven days ending today (YYYY-MM-DD, cents). */
  days: Array<{ day: string; cents: number }>;
  weekCents: number;
  views: number;
  likes: number;
  orders: number;
  quotes: number;
}

/** This week for the Today screen: sales by day, views, likes, orders and quotes sent. */
export async function todayStats(makerId: string): Promise<TodayStats> {
  const db = sql();
  const days = await db<{ day: string; cents: number }[]>`
    with d as (
      select generate_series((now() at time zone ${TZ})::date - 6, (now() at time zone ${TZ})::date, interval '1 day')::date as day
    )
    select to_char(d.day, 'YYYY-MM-DD') as day,
      coalesce((select sum(f.subtotal_cents + f.shipping_cents) from public.fulfilments f join public.orders o on o.id = f.order_id
        where f.maker_id = ${makerId} and ${db.unsafe(SOLD)} and (o.paid_at at time zone ${TZ})::date = d.day), 0)::int as cents
    from d order by d.day`;
  const [k] = await db<{ views: number; likes: number; orders: number; quotes: number }[]>`
    select
      (select count(*) from public.product_views v where v.maker_id = ${makerId} and v.created_at > now() - interval '7 days')::int as views,
      (select count(*) from public.saved_items s join public.products p on p.id = s.product_id
        where p.maker_id = ${makerId} and s.created_at > now() - interval '7 days')::int as likes,
      (select count(*) from public.fulfilments f join public.orders o on o.id = f.order_id
        where f.maker_id = ${makerId} and ${db.unsafe(SOLD)} and o.paid_at > now() - interval '7 days')::int as orders,
      (select count(*) from public.custom_quotes q where q.maker_id = ${makerId} and q.created_at > now() - interval '7 days')::int as quotes`;
  return {
    days,
    weekCents: days.reduce((s, d) => s + d.cents, 0),
    views: k?.views ?? 0,
    likes: k?.likes ?? 0,
    orders: k?.orders ?? 0,
    quotes: k?.quotes ?? 0,
  };
}

/** A made-to-order piece being made with no photo sent to the buyer in the last 5 days. */
export async function photoNudge(makerId: string) {
  const [row] = await sql()<{ id: string; title: string; buyer: string | null }[]>`
    select f.id, oi.product_title as title, o.buyer_name as buyer
    from public.fulfilments f join public.orders o on o.id = f.order_id
    join public.order_items oi on oi.fulfilment_id = f.id
    where f.maker_id = ${makerId} and f.status = 'making' and o.status in ('paid', 'partially_refunded')
      and o.buyer_user_id is not null
      and not exists (
        select 1 from public.message_threads t join public.messages m on m.thread_id = t.id
        where t.maker_id = f.maker_id and t.buyer_user_id = o.buyer_user_id and t.product_id = oi.product_id
          and array_length(m.image_urls, 1) > 0 and m.created_at > now() - interval '5 days')
    order by f.created_at limit 1`;
  return row ?? null;
}

export interface PayoutActivity {
  id: string;
  kind: 'sale' | 'released' | 'advance' | 'hold' | 'paid';
  label: string;
  cents: number;
  at: Date;
}

/** Sales, releases, advances and holds for the phone Payouts screen, newest first. */
export async function payoutActivity(makerId: string, limit = 40): Promise<PayoutActivity[]> {
  const rows = await sql()<
    {
      id: string;
      kind: PayoutActivity['kind'];
      title: string;
      number: string;
      cents: number;
      at: Date;
    }[]
  >`
    select * from (
      select f.id || ':sale' as id, 'sale' as kind, oi.product_title as title, o.order_number as number, f.seller_net_cents as cents, o.paid_at as at
      from public.fulfilments f join public.orders o on o.id = f.order_id
      join lateral (select product_title from public.order_items x where x.fulfilment_id = f.id order by created_at limit 1) oi on true
      where f.maker_id = ${makerId} and o.status in ('paid', 'partially_refunded') and o.paid_at is not null
      union all
      select f.id || ':released', 'released', oi.product_title, o.order_number, f.seller_net_cents, f.transfer_released_at
      from public.fulfilments f join public.orders o on o.id = f.order_id
      join lateral (select product_title from public.order_items x where x.fulfilment_id = f.id order by created_at limit 1) oi on true
      where f.maker_id = ${makerId} and f.transfer_released_at is not null
      union all
      select o.id || ':advance', 'advance', oi.product_title, o.order_number, o.fabric_advance_cents, o.updated_at
      from public.orders o join public.fulfilments f on f.order_id = o.id
      join lateral (select product_title from public.order_items x where x.fulfilment_id = f.id order by created_at limit 1) oi on true
      where f.maker_id = ${makerId} and o.fabric_advance_cents is not null
      union all
      select f.id || ':hold', 'hold', oi.product_title, o.order_number, f.seller_net_cents, f.updated_at
      from public.fulfilments f join public.orders o on o.id = f.order_id
      join lateral (select product_title from public.order_items x where x.fulfilment_id = f.id order by created_at limit 1) oi on true
      where f.maker_id = ${makerId} and f.status = 'issue'
      union all
      select p.id || ':paid', 'paid', 'Payout', '', p.amount_cents, coalesce(p.arrival_date::timestamptz, p.created_at)
      from public.payouts p where p.maker_id = ${makerId} and p.status = 'paid'
    ) a order by at desc nulls last limit ${limit}`;
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    cents: r.cents,
    at: new Date(r.at),
    label:
      r.kind === 'sale'
        ? `Sale · ${r.title}`
        : r.kind === 'released'
          ? `Released · ${r.title}`
          : r.kind === 'advance'
            ? `Fabric advance · ${r.title}`
            : r.kind === 'hold'
              ? `On hold · ${r.title}`
              : 'Paid to your bank',
  }));
}

export const TIPS = [
  'Pieces with a photo on a body sell twice as often as flat lays.',
  'Reply within an hour and your shop earns the “Fast replies” badge.',
  'A progress photo mid-make is the message buyers love most.',
  'Add your sizing notes: fewer fit questions, fewer returns.',
  'Mark “Fabric bought” the day you buy it. Buyers follow every step.',
  'Pieces under A$300 are the most searched on Off One.',
  'Turn on custom work to appear in Have it made matches.',
];
