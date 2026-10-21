import { requireSeller } from '@/lib/auth/session';
import {
  openStripeDashboardAction,
  startPayoutOnboardingAction,
  syncStripeAccount,
} from '@/lib/actions/seller';
import { formatPrice } from '@/lib/domain/money';
import { getPayoutAdjustments, getPayouts } from '@/lib/queries/payouts';
import { TERMS, commissionPctAt, processingEstimateCents } from '@/lib/studio/terms';
import { getStudioShop } from '@/lib/queries/studio';
import { Monogram } from '@/components/ui/Monogram';
import { PhonePayouts } from '@/components/app/studio/Payouts';
import { payoutActivity } from '@/lib/queries/studio-phone';
import { getOverview } from '@/lib/queries/overview';

export const metadata = { title: 'Payouts · Studio' };

const day = (
  iso: string | null,
  opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' },
) =>
  iso
    ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-AU', { ...opts, timeZone: 'UTC' })
    : '—';
const weekday = TERMS.payoutWeekday[0]!.toUpperCase() + TERMS.payoutWeekday.slice(1);

const ADJUSTMENT_HOW: Record<string, string> = {
  reversed: 'Reversed from your Stripe balance',
  next_payout: 'Comes off your next payout',
  taken: 'Taken from your payout',
  before_payout: 'Refunded before it was paid out',
};

const STATUS: Record<string, string> = {
  paid: 'Paid',
  in_transit: 'On the way',
  pending: 'Pending',
  failed: 'Failed',
  canceled: 'Cancelled',
};

export default async function PayoutsPage({ searchParams }: { searchParams: { return?: string } }) {
  const seller = await requireSeller();
  if (searchParams.return) await syncStripeAccount(seller.makerId);
  const [p, shop, adjustments, activity, overview] = await Promise.all([
    getPayouts(seller),
    getStudioShop(seller.makerId),
    getPayoutAdjustments(seller),
    payoutActivity(seller.makerId),
    getOverview(seller),
  ]);

  // "How a sale pays out", with this shop's current rate.
  const piece = 30000;
  const shipping = 1200;
  const pct = commissionPctAt(shop.foundingUntil);
  const commission = Math.round((piece * pct) / 100);
  const fee = processingEstimateCents(piece + shipping);

  return (
    <>
      <div className="md:hidden">
        <PhonePayouts p={p} monthCents={overview.kpi.salesThisMonth} activity={activity} />
      </div>
      <div className="space-y-10 max-md:hidden">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-[40px] leading-none md:text-[56px]">Payouts</h1>
          {p.stripeAccountId && (
            <form action={openStripeDashboardAction}>
              <button
                className="min-h-[44px] text-[11px] uppercase tracking-label underline underline-offset-[6px]"
                data-testid="stripe-dashboard"
              >
                Bank details &amp; tax info in Stripe ↗
              </button>
            </form>
          )}
        </div>

        {!p.connected && (
          <div className="border border-ink p-4 text-[14px]" data-testid="payouts-connect">
            Connect your bank with Stripe to get paid.{' '}
            <form action={startPayoutOnboardingAction} className="mt-3">
              <button className="glass-dark min-h-[48px] px-5 text-[11px] uppercase tracking-[0.18em]">
                Connect with Stripe
              </button>
            </form>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-3">
          <section
            className="glass-dark relative overflow-hidden p-6 text-ground"
            data-testid="next-payout"
          >
            <Monogram className="pointer-events-none absolute -right-8 -top-6 h-[170px] w-[170px] text-ground opacity-[0.07]" />
            <p className="text-[10px] uppercase tracking-[0.2em] text-ground/70">
              Next payout · {day(p.next.date)}
            </p>
            <p className="mt-3 font-display text-[44px] leading-none">
              {formatPrice(p.next.amountCents)}
            </p>
            <p className="mt-3 text-[12px] text-ground/70">
              {p.next.orders} {p.next.orders === 1 ? 'order' : 'orders'}
              {p.bank ? ` · to ${p.bank}` : ''}
            </p>
          </section>
          <section className="border border-line bg-surface p-6" data-testid="on-the-way">
            <p className="text-[11px] uppercase tracking-label text-muted-2">On the way</p>
            <p className="mt-3 font-display text-[40px] leading-none">
              {formatPrice(p.onTheWay.amountCents)}
            </p>
            <p className="mt-3 text-[12px] text-muted">
              {p.onTheWay.orders} {p.onTheWay.orders === 1 ? 'order' : 'orders'}. Released{' '}
              {TERMS.releaseDaysAfterDelivery} days after delivery, then paid out the next {weekday}
              .
            </p>
          </section>
          <section className="border border-line bg-surface p-6" data-testid="paid-all-time">
            <p className="text-[11px] uppercase tracking-label text-muted-2">Paid out, all time</p>
            <p className="mt-3 font-display text-[40px] leading-none">
              {formatPrice(p.paidAllTime)}
            </p>
            {p.founding && p.foundingSaved > 0 && (
              <p className="mt-3 text-[12px] text-muted">
                You’ve saved {formatPrice(p.foundingSaved)} in commission as a founding maker.
              </p>
            )}
          </section>
        </div>

        <div className="grid grid-cols-1 gap-10 md:grid-cols-[minmax(0,1fr)_340px]">
          <section aria-labelledby="history-title" className="min-w-0">
            <h2 id="history-title" className="mb-3 text-[32px] leading-none">
              Payout history
            </h2>
            {p.history.length === 0 ? (
              <p className="text-[13px] text-muted">
                Your first payout lands the {weekday} after your first order is released.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table
                  className="w-full min-w-[520px] text-left text-[13px]"
                  data-testid="payout-history"
                >
                  <thead>
                    <tr className="border-b border-line text-[10px] uppercase tracking-label text-muted-2">
                      <th scope="col" className="py-3 font-normal">
                        Date
                      </th>
                      <th scope="col" className="py-3 text-right font-normal">
                        Orders
                      </th>
                      <th scope="col" className="py-3 text-right font-normal">
                        Sales
                      </th>
                      <th scope="col" className="py-3 text-right font-normal">
                        Fees
                      </th>
                      <th scope="col" className="py-3 text-right font-normal">
                        Paid
                      </th>
                      <th scope="col" className="py-3 pl-6 font-normal">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.history.map((h) => (
                      <tr key={h.id} className="border-b border-line">
                        <td className="py-3">
                          {day(h.arrivalDate, { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="py-3 text-right tabular-nums">{h.orders}</td>
                        <td className="py-3 text-right tabular-nums">
                          {h.salesCents !== null ? formatPrice(h.salesCents) : '—'}
                        </td>
                        <td className="py-3 text-right tabular-nums text-muted">
                          {h.feesCents !== null ? `−${formatPrice(h.feesCents)}` : '—'}
                        </td>
                        <td className="py-3 text-right tabular-nums">
                          {formatPrice(h.amountCents)}
                        </td>
                        <td className={`py-3 pl-6 ${h.status === 'failed' ? 'text-alert' : ''}`}>
                          {STATUS[h.status] ?? h.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {adjustments.length > 0 && (
              <div className="mt-10" data-testid="payout-adjustments">
                <h3 className="mb-3 text-[24px] leading-none">Returns and adjustments</h3>
                <ul className="divide-y divide-line border-y border-line text-[13px]" role="list">
                  {adjustments.map((a) => (
                    <li key={a.id} className="py-3" data-testid="adjustment-row">
                      <span>
                        {a.label} · −{formatPrice(a.amountCents)}
                        <span className="block text-[12px] text-muted">
                          {ADJUSTMENT_HOW[a.how]}
                          {a.how === 'taken' && a.appliedAt
                            ? ` ${new Date(a.appliedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`
                            : ''}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[12px] text-muted">
                  A returned piece comes back out of what you were paid for it. Off One’s commission
                  on it is refunded to you, so only your share is taken.
                </p>
              </div>
            )}
          </section>

          <aside
            className="bg-stone p-5"
            aria-labelledby="example-title"
            data-testid="payout-example"
          >
            <h2 id="example-title" className="text-[26px] leading-none">
              How a sale pays out
            </h2>
            <dl className="mt-4 space-y-1.5 text-[13px]">
              <div className="flex justify-between">
                <dt>Piece</dt>
                <dd>{formatPrice(piece)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Shipping the buyer paid</dt>
                <dd>{formatPrice(shipping)}</dd>
              </div>
              <div className="flex justify-between text-muted">
                <dt>
                  Commission ({pct}% of the piece
                  {pct === TERMS.foundingCommissionPct ? ', founding' : ''})
                </dt>
                <dd>−{formatPrice(commission)}</dd>
              </div>
              <div className="flex justify-between text-muted">
                <dt>Card processing (about 1.75% + 30c)</dt>
                <dd>−{formatPrice(fee)}</dd>
              </div>
              <div className="flex justify-between border-t border-line-strong pt-2 font-display text-[22px]">
                <dt>You get</dt>
                <dd>{formatPrice(piece + shipping - commission - fee)}</dd>
              </div>
            </dl>
            <ol className="mt-5 space-y-2 text-[12px] text-muted">
              <li>1. The buyer pays; the money waits with Off One.</li>
              <li>2. You ship; it’s delivered.</li>
              <li>
                3. {TERMS.releaseDaysAfterDelivery} days later (if there’s no problem reported) it’s
                released to your Stripe balance.
              </li>
              <li>4. Stripe pays your balance to your bank every {weekday}.</li>
            </ol>
            {pct !== TERMS.standardCommissionPct && (
              <p className="mt-3 text-[12px] text-muted">
                After your founding period, commission is {TERMS.standardCommissionPct}%.
              </p>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}
