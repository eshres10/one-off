import type { PayoutsView } from '@/lib/queries/payouts';
import type { PayoutActivity } from '@/lib/queries/studio-phone';
import { formatPrice } from '@/lib/domain/money';
import { TERMS } from '@/lib/studio/terms';
import { SITE } from '@/lib/site/config';

const day = (iso: string | null) =>
  iso
    ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-AU', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      })
    : '—';
const when = (d: Date) =>
  d.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Australia/Melbourne',
  });

/** Payouts (phones): next payout, month to date and held, the activity list, the plain explainer. */
export function PhonePayouts({
  p,
  monthCents,
  activity,
}: {
  p: PayoutsView;
  monthCents: number;
  activity: PayoutActivity[];
}) {
  return (
    <div className="pb-6" data-testid="phone-payouts">
      <h1 className="text-[36px] leading-none">Payouts</h1>
      <section
        className="mt-4 rounded-app bg-ink p-5 text-ground"
        aria-label="Next payout"
        data-testid="next-payout"
      >
        <p className="text-[10px] uppercase tracking-[0.2em] text-ground/70">Next payout</p>
        <p className="mt-2 font-display text-[40px] leading-none">
          {formatPrice(p.next.amountCents)}
        </p>
        <p className="mt-2 text-[13px] text-ground/80">
          {day(p.next.date)}
          {p.bank ? ` · to ${p.bank}` : p.connected ? '' : ' · connect your bank in Settings'}
        </p>
      </section>
      <dl className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-app bg-surface px-4 py-3">
          <dt className="text-[11px] uppercase tracking-label text-muted-2">Month to date</dt>
          <dd className="mt-1 font-display text-[24px] leading-none" data-testid="month-to-date">
            {formatPrice(monthCents)}
          </dd>
        </div>
        <div className="rounded-app bg-surface px-4 py-3">
          <dt className="text-[11px] uppercase tracking-label text-muted-2">Held until delivery</dt>
          <dd className="mt-1 font-display text-[24px] leading-none" data-testid="held">
            {formatPrice(p.onTheWay.amountCents)}
          </dd>
        </div>
      </dl>
      <section className="mt-6" aria-labelledby="activity-title">
        <h2 id="activity-title" className="font-display text-[24px]">
          Activity
        </h2>
        {activity.length ? (
          <ul className="mt-2 divide-y divide-line" role="list" data-testid="payout-activity">
            {activity.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-3 text-[13px]">
                <span className="min-w-0">
                  <span className="block truncate">{a.label}</span>
                  <span className="block text-[11px] text-muted-2">{when(a.at)}</span>
                </span>
                <span
                  className={`shrink-0 ${a.kind === 'hold' ? 'text-[#8A2E1C]' : a.kind === 'paid' ? 'text-muted' : ''}`}
                >
                  {a.kind === 'hold' ? 'held' : formatPrice(a.cents)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[13px] text-muted">Your first sale will show here.</p>
        )}
      </section>
      <section
        className="mt-6 rounded-app bg-stone px-4 py-4 text-[13px] leading-relaxed"
        aria-label="How payouts work"
        data-testid="payout-explainer"
      >
        <p>
          You’re paid {TERMS.releaseDaysAfterDelivery} days after a piece is delivered, then it goes
          to your bank the next {TERMS.payoutWeekday}. Off One keeps {TERMS.standardCommissionPct}%
          of the piece, never the shipping.
          {SITE.payouts.advanceOnMadeToOrder
            ? ' Made-to-order and Have it made pieces pay 30% when you mark the fabric bought.'
            : ' Have it made pieces pay 30% when you mark the fabric bought.'}
        </p>
      </section>
    </div>
  );
}
