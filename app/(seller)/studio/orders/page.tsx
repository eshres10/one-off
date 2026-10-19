import Link from 'next/link';
import { requireSeller } from '@/lib/auth/session';
import { getSellerOrders } from '@/lib/queries/seller';
import { formatPrice } from '@/lib/domain/money';
import { StatusPill } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';

export const metadata = { title: 'Orders' };

export default async function SellerOrdersPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const seller = await requireSeller();
  const all = await getSellerOrders(seller);
  const filter = searchParams.status;
  const orders = filter ? all.filter((o) => o.status === filter) : all;
  const tabs = ['paid', 'preparing', 'shipped', 'delivered', 'refunded'];
  return (
    <div className="space-y-6">
      <h1 className="text-[40px] leading-none md:text-[48px]">Orders</h1>
      <nav className="flex flex-wrap gap-2" aria-label="Filter orders">
        <Link
          href="/studio/orders"
          className={`inline-flex min-h-[44px] items-center px-4 text-[11px] uppercase tracking-label ${!filter ? 'glass-dark' : 'border border-line-strong'}`}
        >
          All ({all.length})
        </Link>
        {tabs.map((t) => (
          <Link
            key={t}
            href={`/studio/orders?status=${t}`}
            className={`inline-flex min-h-[44px] items-center px-4 text-[11px] uppercase capitalize tracking-label ${filter === t ? 'glass-dark' : 'border border-line-strong'}`}
          >
            {t === 'paid' ? 'New' : t} ({all.filter((o) => o.status === t).length})
          </Link>
        ))}
      </nav>
      {orders.length === 0 ? (
        <EmptyState title="No orders here yet">
          New orders appear here and are emailed to you as soon as they’re paid.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-stone/70 bg-white">
          <table className="w-full min-w-[640px] text-left text-sm" data-testid="seller-orders">
            <thead className="border-b border-stone/70 text-xs text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">Pieces</th>
                <th className="px-4 py-3 font-medium">Placed</th>
                <th className="px-4 py-3 font-medium">Dispatch by</th>
                <th className="px-4 py-3 font-medium">Your payout</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone/60">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-stone-light/40">
                  <td className="px-4 py-3">
                    <Link
                      href={`/studio/orders/${o.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {o.orderNumber}
                    </Link>
                  </td>
                  <td className="max-w-[240px] truncate px-4 py-3">
                    {o.items.map((i) => `${i.productTitle} (${i.variantLabel})`).join(', ')}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {new Date(o.createdAt).toLocaleDateString('en-AU', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {o.estimatedDispatchDate
                      ? new Date(o.estimatedDispatchDate).toLocaleDateString('en-AU', {
                          day: 'numeric',
                          month: 'short',
                        })
                      : '—'}
                  </td>
                  <td className="px-4 py-3">{formatPrice(o.sellerNetCents)}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={o.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
