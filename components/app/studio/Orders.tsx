'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { StudioOrderRow } from '@/lib/services/studio-orders';
import { BUCKETS, bucketOf, nowNext, stepsOf, type OrderBucket } from '@/lib/app/studio-orders';
import { daysUntil, shipByLabel } from '@/lib/studio/format';
import { Img as Image } from '@/components/ui/Img';
import { ChevronIcon } from '@/components/ui/icons';
import { Chip } from '../ui';

export function StepBar({ labels, current }: { labels: string[]; current: number }) {
  const pct = Math.round((current / (labels.length - 1)) * 100);
  return (
    <div className="h-1 overflow-hidden rounded-pill bg-stone" aria-hidden>
      <div className="h-full rounded-pill bg-ink" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Orders (phones): To start / Making / To ship / Done, each row with its step bar. */
export function PhoneOrders({ rows, bucket }: { rows: StudioOrderRow[]; bucket: OrderBucket }) {
  const router = useRouter();
  const counts = Object.fromEntries(BUCKETS.map((b) => [b.key, 0])) as Record<OrderBucket, number>;
  for (const r of rows) counts[bucketOf(r)]++;
  const list = rows.filter((r) => bucketOf(r) === bucket);
  return (
    <div className="pb-6" data-testid="phone-orders">
      <h1 className="text-[36px] leading-none">Orders</h1>
      <div
        className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4"
        role="tablist"
        aria-label="Orders"
      >
        {BUCKETS.map((b) => (
          <Chip
            key={b.key}
            pressed={b.key === bucket}
            onClick={() => router.replace(`/studio/orders?tab=${b.key}`)}
            testId={`bucket-${b.key}`}
          >
            {b.label}
            <span className={b.key === bucket ? 'text-ground/70' : 'text-muted-2'}>
              {counts[b.key]}
            </span>
          </Chip>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="mt-10 text-center text-[13px] text-muted">
          {bucket === 'to-ship' ? 'Nothing to ship. Nice work.' : 'Nothing here right now.'}
        </p>
      ) : (
        <ul className="mt-4 space-y-2" role="list">
          {list.map((o) => {
            const d = daysUntil(o.shipBy);
            const open = bucketOf(o) !== 'done';
            const due = open && d !== null && d <= 0;
            const steps = stepsOf(o);
            return (
              <li key={o.id}>
                <Link
                  href={`/studio/orders/${o.id}`}
                  className="block rounded-app border border-line bg-surface p-3"
                  data-testid="phone-order-row"
                >
                  <span className="flex gap-3">
                    <span className="relative h-[72px] w-[58px] shrink-0 overflow-hidden rounded-[6px] bg-stone">
                      {o.imageUrl && (
                        <Image
                          src={o.imageUrl}
                          alt=""
                          fill
                          sizes="58px"
                          className="object-cover object-top"
                        />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className="min-w-0">
                          <span className="block truncate text-[14px]">{o.title}</span>
                          <span className="block truncate text-[12px] text-muted">
                            {o.buyerName ?? 'Guest'} · {o.variantLabel.replace(/^AU /, 'Size ')}
                          </span>
                        </span>
                        <span
                          className={`shrink-0 text-[12px] ${due ? 'text-[#8A2E1C]' : 'text-muted'}`}
                          data-testid="row-due"
                        >
                          {open ? shipByLabel(o.shipBy) : 'Done'}
                        </span>
                      </span>
                      <span className="mt-2 block">
                        <StepBar labels={steps.labels} current={steps.current} />
                      </span>
                      <span className="mt-1.5 flex items-center justify-between text-[11px] text-muted-2">
                        <span>{nowNext(o)}</span>
                        <ChevronIcon width={14} height={14} />
                      </span>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
