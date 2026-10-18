import { marketplaceMetrics } from '@/lib/services/admin';
import { formatPrice } from '@/lib/domain/money';
import { sql } from '@/lib/db';
import { Stat } from '@/components/seller/Stat';

export const metadata = { title: 'Admin' };

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export default async function AdminHome() {
  const m = await marketplaceMetrics(30);
  const events = await sql()<
    { id: string; action: string; entityType: string; entityId: string | null; createdAt: Date }[]
  >`
    select id, action, entity_type, entity_id, created_at from public.audit_events order by created_at desc limit 15`;
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[40px] leading-none md:text-[48px]">Marketplace metrics</h1>
        <p className="text-sm text-ink-muted">Last 30 days (repeat purchase rate is all-time)</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="admin-metrics">
        <Stat label="GMV" value={formatPrice(m.gmvCents)} />
        <Stat label="Orders" value={String(m.orders)} />
        <Stat
          label="Take rate"
          value={pct(m.takeRate)}
          hint={`${formatPrice(m.platformFeeCents)} commission`}
        />
        <Stat
          label="Conversion rate"
          value={pct(m.conversionRate)}
          hint="Orders ÷ unique product viewers"
        />
        <Stat label="Active listings" value={String(m.activeListings)} />
        <Stat label="Active makers" value={String(m.activeMakers)} />
        <Stat label="Repeat purchase rate" value={pct(m.repeatPurchaseRate)} />
        <Stat
          label="Refund rate"
          value={pct(m.refundRate)}
          hint={`${formatPrice(m.refundedCents)} refunded`}
        />
      </div>
      <section>
        <h2 className="mb-4 text-[28px] leading-none">Recent activity</h2>
        <ul
          className="divide-y divide-stone/70 rounded-2xl border border-stone/70 bg-white text-sm"
          role="list"
        >
          {events.map((e) => (
            <li key={e.id} className="flex justify-between gap-3 px-4 py-2.5">
              <span>
                <span className="font-mono text-xs">{e.action}</span>{' '}
                <span className="text-ink-muted">
                  {e.entityType} {e.entityId?.slice(0, 8)}
                </span>
              </span>
              <time className="text-xs text-ink-muted">
                {new Date(e.createdAt).toLocaleString('en-AU', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}
              </time>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
