import { sql } from '@/lib/db';
import { stageOf, type Stage } from '@/lib/account/progress';
import type { SessionUser } from '@/lib/auth/session';
import { unreadCount } from '@/lib/services/messaging';

type Actor = Pick<SessionUser, 'id' | 'role' | 'makerId' | 'email' | 'displayName'>;

export interface AccountSummary {
  firstName: string;
  email: string;
  inProgress: number;
  messagesNew: number;
  saved: number;
  usualSize: string | null;
  addresses: number;
  /** The latest order still on its way: its pieces and where each one is. */
  active: {
    orderNumber: string;
    pieces: Array<{
      id: string;
      title: string;
      imageUrl: string | null;
      maker: string;
      stage: Stage;
    }>;
  } | null;
}

/** Counters for the account menu and the phone account home. */
export async function accountSummary(user: Actor): Promise<AccountSummary> {
  const [row] = await sql()<
    {
      firstName: string | null;
      inProgress: number;
      saved: number;
      usualSize: string | null;
      addresses: number;
    }[]
  >`
    select coalesce(p.first_name, split_part(u.display_name, ' ', 1)) as first_name,
      (select count(*) from public.fulfilments f join public.orders o on o.id = f.order_id
        where o.buyer_user_id = u.id and o.status in ('paid', 'partially_refunded')
          and f.status::text not in ('delivered', 'completed', 'cancelled', 'refunded', 'issue'))::int as in_progress,
      (select count(*) from public.saved_items s where s.user_id = u.id)::int as saved,
      p.usual_size, coalesce(jsonb_array_length(p.addresses), 0)::int as addresses
    from public.users u left join public.customer_prefs p on p.user_id = u.id where u.id = ${user.id}`;
  const pieces = await sql()<
    {
      orderNumber: string;
      id: string;
      title: string;
      imageUrl: string | null;
      maker: string;
      status: string;
      isMto: boolean;
    }[]
  >`
    select o.order_number, oi.id, oi.product_title as title, oi.image_url, m.display_name as maker, f.status::text as status,
      oi.product_type = 'made_to_order' as is_mto
    from public.orders o join public.fulfilments f on f.order_id = o.id
    join public.order_items oi on oi.fulfilment_id = f.id join public.makers m on m.id = f.maker_id
    where o.id = (
      select o2.id from public.orders o2 join public.fulfilments f2 on f2.order_id = o2.id
      where o2.buyer_user_id = ${user.id} and o2.status in ('paid', 'partially_refunded')
        and f2.status::text not in ('delivered', 'completed', 'cancelled', 'refunded', 'issue')
      order by o2.created_at desc limit 1)
    order by f.created_at, oi.created_at`;
  return {
    firstName: row?.firstName || user.displayName?.split(' ')[0] || 'there',
    email: user.email,
    inProgress: row?.inProgress ?? 0,
    messagesNew: await unreadCount(user),
    saved: row?.saved ?? 0,
    usualSize: row?.usualSize ?? null,
    addresses: row?.addresses ?? 0,
    active: pieces.length
      ? {
          orderNumber: pieces[0]!.orderNumber,
          pieces: pieces.map((p) => ({
            id: p.id,
            title: p.title,
            imageUrl: p.imageUrl,
            maker: p.maker,
            stage: stageOf(p.status, p.isMto),
          })),
        }
      : null,
  };
}
