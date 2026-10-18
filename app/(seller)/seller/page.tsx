import Link from 'next/link';
import { requireSeller } from '@/lib/auth/session';
import { getSellerMaker, getSellerOrders, getSellerStats } from '@/lib/queries/seller';
import { formatPrice } from '@/lib/domain/money';
import { Stat } from '@/components/seller/Stat';
import { StatusPill } from '@/components/ui/Badge';
import { CheckIcon } from '@/components/ui/icons';

export const metadata = { title: 'Seller dashboard' };

export default async function SellerHome() {
  const seller = await requireSeller();
  const [maker, stats, orders] = await Promise.all([
    getSellerMaker(seller),
    getSellerStats(seller),
    getSellerOrders(seller),
  ]);
  const checklist = [
    {
      done: Boolean(maker.story && maker.city),
      label: 'Complete your maker profile',
      href: '/seller/onboarding',
    },
    {
      done: maker.stripeOnboardingComplete,
      label: 'Set up payouts with Stripe',
      href: '/seller/payouts',
    },
    {
      done: maker.status === 'approved',
      label:
        maker.status === 'pending' ? 'Profile in review by our team' : 'Get your profile approved',
      href: '/seller/onboarding',
    },
  ];
  const open = orders.filter((o) => o.status === 'paid' || o.status === 'preparing');
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[40px] leading-none md:text-[48px]">Hi, {maker.displayName}</h1>
        <p className="text-sm text-ink-muted">Here’s what’s happening in your studio.</p>
      </div>
      {checklist.some((c) => !c.done) && (
        <section className="card p-5" aria-labelledby="setup">
          <h2 id="setup" className="font-sans text-[11px] font-normal uppercase tracking-label">
            Finish setting up
          </h2>
          <ul className="mt-3 space-y-2">
            {checklist.map((c) => (
              <li key={c.label} className="flex items-center gap-3 text-sm">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-circle ${c.done ? 'bg-ink text-ground' : 'border border-line-strong'}`}
                >
                  {c.done && <CheckIcon width={14} height={14} />}
                </span>
                {c.done ? (
                  <span className="text-ink-muted line-through">{c.label}</span>
                ) : (
                  <Link href={c.href} className="link">
                    {c.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Orders to ship" value={String(open.length)} />
        <Stat label="Revenue (30 days)" value={formatPrice(stats.revenueCents)} />
        <Stat label="Views (30 days)" value={String(stats.views)} />
        <Stat label="Unread messages" value={String(stats.unreadThreads)} />
      </div>
      <section aria-labelledby="recent">
        <div className="mb-3 flex items-end justify-between">
          <h2 id="recent" className="text-[28px] leading-none">
            Orders to prepare
          </h2>
          <Link href="/seller/orders" className="text-sm underline underline-offset-4">
            All orders
          </Link>
        </div>
        {open.length === 0 ? (
          <p className="text-sm text-ink-muted">You’re all caught up.</p>
        ) : (
          <ul
            className="divide-y divide-stone/70 rounded-2xl border border-stone/70 bg-white"
            role="list"
          >
            {open.slice(0, 5).map((o) => (
              <li key={o.id}>
                <Link
                  href={`/seller/orders/${o.id}`}
                  className="flex items-center justify-between gap-3 p-4 hover:bg-stone-light/40"
                >
                  <div className="text-sm">
                    <p className="font-medium">
                      {o.orderNumber} · {o.items.map((i) => i.productTitle).join(', ')}
                    </p>
                    <p className="text-ink-muted">
                      Dispatch by{' '}
                      {o.estimatedDispatchDate
                        ? new Date(o.estimatedDispatchDate).toLocaleDateString('en-AU', {
                            dateStyle: 'medium',
                          })
                        : '—'}
                    </p>
                  </div>
                  <StatusPill status={o.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
