import { sql } from '@/lib/db';
import type { SessionUser } from '@/lib/auth/session';
import { formatPrice } from '@/lib/domain/money';

type Actor = Pick<SessionUser, 'id'>;

export interface BuyerNotification {
  id: string;
  kind: 'shipped' | 'delivered' | 'quote' | 'making';
  title: string;
  body: string;
  href: string;
  at: Date;
  imageUrl: string | null;
}

/**
 * The Inbox's Notifications tab: what has happened to your orders and requests, newest first.
 * Built from the order and quote tables, so nothing needs storing separately.
 */
export async function listBuyerNotifications(
  user: Actor,
  limit = 40,
): Promise<BuyerNotification[]> {
  const rows = await sql()<
    {
      id: string;
      kind: BuyerNotification['kind'];
      orderNumber: string | null;
      requestNumber: string | null;
      maker: string;
      title: string;
      price: number | null;
      at: Date;
      imageUrl: string | null;
    }[]
  >`
    select * from (
      select f.id || ':shipped' as id, 'shipped' as kind, o.order_number, null as request_number, m.display_name as maker,
        (select product_title from public.order_items oi where oi.fulfilment_id = f.id order by created_at limit 1) as title,
        null::int as price, f.shipped_at as at,
        (select image_url from public.order_items oi where oi.fulfilment_id = f.id order by created_at limit 1) as image_url
      from public.fulfilments f join public.orders o on o.id = f.order_id join public.makers m on m.id = f.maker_id
      where o.buyer_user_id = ${user.id} and f.shipped_at is not null
      union all
      select f.id || ':delivered', 'delivered', o.order_number, null, m.display_name,
        (select product_title from public.order_items oi where oi.fulfilment_id = f.id order by created_at limit 1),
        null, f.delivered_at,
        (select image_url from public.order_items oi where oi.fulfilment_id = f.id order by created_at limit 1)
      from public.fulfilments f join public.orders o on o.id = f.order_id join public.makers m on m.id = f.maker_id
      where o.buyer_user_id = ${user.id} and f.delivered_at is not null
      union all
      select f.id || ':making', 'making', o.order_number, null, m.display_name,
        (select product_title from public.order_items oi where oi.fulfilment_id = f.id order by created_at limit 1),
        null, f.updated_at,
        (select image_url from public.order_items oi where oi.fulfilment_id = f.id order by created_at limit 1)
      from public.fulfilments f join public.orders o on o.id = f.order_id join public.makers m on m.id = f.maker_id
      where o.buyer_user_id = ${user.id} and f.status = 'making' and f.shipped_at is null
      union all
      select q.id || ':quote', 'quote', null, r.number, m.display_name, r.kind, q.price, q.created_at, m.avatar_url
      from public.custom_quotes q join public.custom_requests r on r.id = q.request_id join public.makers m on m.id = q.maker_id
      where r.buyer_id = ${user.id} and q.status in ('sent', 'accepted', 'expired')
    ) n order by at desc nulls last limit ${limit}`;
  return rows.map((r) => {
    const at = new Date(r.at);
    switch (r.kind) {
      case 'shipped':
        return {
          id: r.id,
          kind: r.kind,
          title: `${r.maker} sent your ${r.title}`,
          body: `Order ${r.orderNumber} is on its way.`,
          href: `/account/orders/${r.orderNumber}`,
          at,
          imageUrl: r.imageUrl,
        };
      case 'delivered':
        return {
          id: r.id,
          kind: r.kind,
          title: `Your ${r.title} arrived`,
          body: `Order ${r.orderNumber}. Tell ${r.maker} how it fits.`,
          href: `/account/orders/${r.orderNumber}`,
          at,
          imageUrl: r.imageUrl,
        };
      case 'making':
        return {
          id: r.id,
          kind: r.kind,
          title: `${r.maker} is making your ${r.title}`,
          body: `Order ${r.orderNumber}. Follow each step on your order.`,
          href: `/account/orders/${r.orderNumber}`,
          at,
          imageUrl: r.imageUrl,
        };
      default:
        return {
          id: r.id,
          kind: 'quote',
          title: `${r.maker} sent a quote`,
          body: `${formatPrice(r.price ?? 0)} for your ${r.title}, request ${r.requestNumber}.`,
          href: `/account/requests/${r.requestNumber}`,
          at,
          imageUrl: r.imageUrl,
        };
    }
  });
}
