import Link from 'next/link';
import type { Overview } from '@/lib/queries/overview';
import type { TodayStats } from '@/lib/queries/studio-phone';
import { TIPS } from '@/lib/queries/studio-phone';
import { formatPrice } from '@/lib/domain/money';
import { greeting } from '@/lib/studio/format';
import { Img as Image } from '@/components/ui/Img';
import { CameraIcon, ChevronIcon } from '@/components/ui/icons';

const dayLetter = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-AU', { weekday: 'narrow', timeZone: 'UTC' });

function Stat({
  label,
  value,
  testId,
}: {
  label: string;
  value: string | number;
  testId?: string;
}) {
  return (
    <div className="rounded-app bg-surface px-3 py-3" data-testid={testId}>
      <p className="font-display text-[24px] leading-none">{value}</p>
      <p className="mt-1 text-[11px] uppercase tracking-label text-muted-2">{label}</p>
    </div>
  );
}

/**
 * Today (phones): a greeting, this week's sales with a 7-day chart, views / likes / orders /
 * quotes, the To do cards that deep-link to the screen that finishes the task, the next payout
 * and one tip.
 */
export function Today({
  shopName,
  o,
  stats,
  nudge,
  firstName,
}: {
  shopName: string;
  o: Overview;
  stats: TodayStats;
  nudge: { id: string; title: string; buyer: string | null } | null;
  firstName: string;
}) {
  const max = Math.max(...stats.days.map((d) => d.cents), 1);
  const todo = o.needs.slice(0, 6);
  const tip = TIPS[new Date().getDate() % TIPS.length]!;
  const hrefFor = (n: Overview['needs'][number]) =>
    n.kind === 'ship'
      ? `/studio/orders/${n.id.replace(/^ship-/, '')}`
      : n.kind === 'custom'
        ? `/studio/inbox/requests/${n.id.replace(/^custom-/, '')}`
        : n.href;
  return (
    <div className="pb-6" data-testid="studio-today">
      <p className="text-[11px] uppercase tracking-label text-muted-2">{shopName}</p>
      <h1 className="mt-1 text-[36px] leading-none">
        {greeting().long}, {firstName}.
      </h1>

      <section
        className="mt-5 rounded-app bg-ink p-5 text-ground"
        aria-label="This week"
        data-testid="week-sales"
      >
        <p className="text-[10px] uppercase tracking-[0.2em] text-ground/70">This week</p>
        <p className="mt-2 font-display text-[40px] leading-none">{formatPrice(stats.weekCents)}</p>
        <div className="mt-4 flex h-[72px] items-end gap-1.5" aria-hidden>
          {stats.days.map((d, i) => (
            <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
              <div
                className={`w-full rounded-[3px] ${i === stats.days.length - 1 ? 'bg-ground' : 'bg-ground/40'}`}
                style={{ height: `${Math.max(4, (d.cents / max) * 56)}px` }}
              />
              <span className="text-[9px] text-ground/60">{dayLetter(d.day)}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-3 grid grid-cols-4 gap-2">
        <Stat label="Views" value={stats.views} testId="stat-views" />
        <Stat label="Likes" value={stats.likes} testId="stat-likes" />
        <Stat label="Orders" value={stats.orders} testId="stat-orders" />
        <Stat label="Quotes" value={stats.quotes} testId="stat-quotes" />
      </div>

      <section className="mt-6" aria-labelledby="todo-title">
        <h2 id="todo-title" className="font-display text-[26px]">
          To do
        </h2>
        {todo.length === 0 && !nudge ? (
          <p className="mt-2 rounded-app bg-surface px-4 py-5 text-[13px] text-muted">
            All caught up. Nothing needs you today.
          </p>
        ) : (
          <ul className="mt-3 space-y-2" role="list" data-testid="todo-list">
            {todo.map((n) => (
              <li key={n.id}>
                <Link
                  href={hrefFor(n)}
                  className={`flex items-center gap-3 rounded-app border bg-surface p-3 ${n.urgent ? 'border-[#8A2E1C]' : 'border-line'}`}
                  data-testid="todo-card"
                  data-kind={n.kind}
                >
                  <span className="relative h-14 w-11 shrink-0 overflow-hidden rounded-[6px] bg-stone">
                    {n.imageUrl && (
                      <Image
                        src={n.imageUrl}
                        alt=""
                        fill
                        sizes="44px"
                        className="object-cover object-top"
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px]">{n.title}</span>
                    <span className="block truncate text-[12px] text-muted">{n.sub}</span>
                    <span
                      className={`mt-1 inline-block rounded-pill px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] ${n.urgent ? 'bg-[#8A2E1C] text-ground' : 'bg-stone text-muted'}`}
                    >
                      {n.tag}
                    </span>
                  </span>
                  <ChevronIcon width={16} height={16} className="text-muted-2" />
                </Link>
              </li>
            ))}
            {nudge && (
              <li>
                <Link
                  href={`/studio/orders/${nudge.id}?photo=1`}
                  className="flex items-center gap-3 rounded-app border border-line bg-surface p-3"
                  data-testid="todo-photo-nudge"
                >
                  <span className="flex h-14 w-11 shrink-0 items-center justify-center rounded-[6px] bg-stone">
                    <CameraIcon width={20} height={20} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px]">Send a progress photo</span>
                    <span className="block truncate text-[12px] text-muted">
                      {nudge.buyer ?? 'The buyer'} would love to see the {nudge.title} taking shape.
                    </span>
                  </span>
                  <ChevronIcon width={16} height={16} className="text-muted-2" />
                </Link>
              </li>
            )}
          </ul>
        )}
      </section>

      <Link
        href="/studio/payouts"
        className="mt-6 flex items-center justify-between rounded-app bg-surface p-4"
        data-testid="next-payout-card"
      >
        <span>
          <span className="block text-[11px] uppercase tracking-label text-muted-2">
            Next payout
          </span>
          <span className="mt-1 block font-display text-[26px] leading-none">
            {formatPrice(o.payout.nextAmount)}
          </span>
          <span className="mt-1 block text-[12px] text-muted">
            {new Date(`${o.payout.nextDate}T00:00:00Z`).toLocaleDateString('en-AU', {
              weekday: 'long',
              day: 'numeric',
              month: 'short',
              timeZone: 'UTC',
            })}
            {o.payout.onTheWay ? ` · ${formatPrice(o.payout.onTheWay)} held until delivery` : ''}
          </span>
        </span>
        <ChevronIcon width={16} height={16} className="text-muted-2" />
      </Link>

      <p
        className="mt-4 rounded-app border border-dashed border-line-strong px-4 py-3 text-[13px] text-muted"
        data-testid="tip"
      >
        <span className="text-[10px] uppercase tracking-label text-muted-2">Tip · </span>
        {tip}
      </p>
    </div>
  );
}
