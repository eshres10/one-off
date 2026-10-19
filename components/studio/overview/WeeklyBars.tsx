import { formatPrice } from '@/lib/domain/money';

const label = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

/**
 * Sales for the last eight weeks: one bar per week, the current week in ink and the rest in
 * line-strong. Each bar names its week and amount on hover; a table carries the same numbers.
 */
export function WeeklyBars({ weeks }: { weeks: Array<{ weekStart: string; cents: number }> }) {
  const max = Math.max(...weeks.map((w) => w.cents), 1);
  const current = weeks[weeks.length - 1];
  return (
    <figure>
      <figcaption className="flex items-baseline justify-between">
        <span className="text-[11px] uppercase tracking-label text-muted-2">
          Sales, last 8 weeks
        </span>
        <span className="text-[12px] text-muted">This week {formatPrice(current?.cents ?? 0)}</span>
      </figcaption>
      <div className="mt-4 flex h-[140px] items-end gap-[6px]" aria-hidden>
        {weeks.map((w, i) => (
          <div key={w.weekStart} className="group relative flex h-full flex-1 items-end">
            <div
              title={`Week of ${label(w.weekStart)}: ${formatPrice(w.cents)}`}
              className={`w-full ${i === weeks.length - 1 ? 'bg-ink' : 'bg-line-strong group-hover:bg-muted-2'}`}
              style={{ height: `${Math.max(2, (w.cents / max) * 100)}%` }}
            />
            <span className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 whitespace-nowrap bg-ink px-2 py-0.5 text-[11px] text-ground group-hover:block">
              {formatPrice(w.cents)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-[6px] text-[10px] text-muted-2" aria-hidden>
        {weeks.map((w, i) => (
          <span key={w.weekStart} className="flex-1 text-center">
            {i === weeks.length - 1 ? 'Now' : i % 2 === 1 ? label(w.weekStart) : ''}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Sales by week</caption>
        <thead>
          <tr>
            <th scope="col">Week of</th>
            <th scope="col">Sales</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.weekStart}>
              <td>{label(w.weekStart)}</td>
              <td>{formatPrice(w.cents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
