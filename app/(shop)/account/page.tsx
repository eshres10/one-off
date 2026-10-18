import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { getBuyerOrders } from '@/lib/queries/account';
import { unreadCount } from '@/lib/services/messaging';
import { formatPrice } from '@/lib/domain/money';
import { StatusPill } from '@/components/ui/Badge';

export const metadata = { title: 'Your account' };

export default async function AccountPage() {
  const user = await requireUser('/account');
  const [orders, unread] = await Promise.all([getBuyerOrders(user), unreadCount(user)]);
  const toReview = orders
    .flatMap((o) => o.fulfilments.flatMap((f) => f.items))
    .filter((i) => i.fulfilmentStatus === 'delivered' && !i.reviewed);
  return (
    <div className="grid gap-6 md:grid-cols-3">
      <Link href="/account/orders" className="card p-5 hover:border-ink">
        <p className="eyebrow">Orders</p>
        <p className="mt-2 font-display text-3xl">{orders.length}</p>
        {orders[0] && (
          <p className="mt-2 flex items-center gap-2 text-sm text-ink-muted">
            Latest {orders[0].orderNumber} · {formatPrice(orders[0].totalCents)}{' '}
            <StatusPill status={orders[0].fulfilments[0]?.status ?? orders[0].status} />
          </p>
        )}
      </Link>
      <Link href="/account/messages" className="card p-5 hover:border-ink">
        <p className="eyebrow">Messages</p>
        <p className="mt-2 font-display text-3xl">{unread}</p>
        <p className="mt-2 text-sm text-ink-muted">unread conversation{unread === 1 ? '' : 's'}</p>
      </Link>
      <Link href="/account/orders" className="card p-5 hover:border-ink">
        <p className="eyebrow">Reviews</p>
        <p className="mt-2 font-display text-3xl">{toReview.length}</p>
        <p className="mt-2 text-sm text-ink-muted">
          delivered piece{toReview.length === 1 ? '' : 's'} to review
        </p>
      </Link>
    </div>
  );
}
