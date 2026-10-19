import Link from 'next/link';
import { requireSeller } from '@/lib/auth/session';
import { getDailyViews, getSellerStats } from '@/lib/queries/seller';
import { ViewsChart } from '@/components/seller/ViewsChart';
import { formatPrice } from '@/lib/domain/money';
import { Stat } from '@/components/seller/Stat';
import { responseTimeLabel } from '@/components/maker/MakerByline';

export const metadata = { title: 'Analytics' };

export default async function AnalyticsPage() {
  const seller = await requireSeller();
  const [s, daily] = await Promise.all([getSellerStats(seller, 30), getDailyViews(seller, 30)]);
  const max = Math.max(1, ...s.topProducts.map((p) => p.views));
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[40px] leading-none md:text-[48px]">Analytics</h1>
        <p className="text-sm text-ink-muted">Last 30 days</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="Product views" value={String(s.views)} />
        <Stat label="Saves (all time)" value={String(s.saves)} />
        <Stat label="Orders" value={String(s.orders)} />
        <Stat
          label="Conversion"
          value={`${(s.conversionRate * 100).toFixed(1)}%`}
          hint="Orders ÷ product views"
        />
        <Stat
          label="Revenue"
          value={formatPrice(s.revenueCents)}
          hint="Item sales before commission"
        />
        <Stat
          label="Response time"
          value={`${s.responseTimeHours}h`}
          hint={responseTimeLabel(s.responseTimeHours)}
        />
      </div>
      <section className="border-t border-line pt-6">
        <ViewsChart data={daily} />
      </section>
      <section>
        <h2 className="mb-4 text-[28px] leading-none">Top pieces</h2>
        <ul className="space-y-3" role="list">
          {s.topProducts.map((p) => (
            <li key={p.id} className="card p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <Link href={`/products/${p.slug}`} className="font-medium hover:underline">
                  {p.title}
                </Link>
                <span className="text-ink-muted">
                  {p.views} views · {p.saves} saves · {p.orders} orders ·{' '}
                  {formatPrice(p.revenueCents)}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-light" aria-hidden>
                <div
                  className="h-full rounded-full bg-ink"
                  style={{ width: `${(p.views / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
