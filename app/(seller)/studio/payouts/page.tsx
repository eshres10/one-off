import { requireSeller } from '@/lib/auth/session';
import { getSellerMaker, getSellerOrders, getSellerStats } from '@/lib/queries/seller';
import {
  openStripeDashboardAction,
  startPayoutOnboardingAction,
  syncStripeAccount,
} from '@/lib/actions/seller';
import { formatPrice } from '@/lib/domain/money';
import { Stat } from '@/components/seller/Stat';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { StatusPill } from '@/components/ui/Badge';

export const metadata = { title: 'Payouts' };

export default async function PayoutsPage({
  searchParams,
}: {
  searchParams: { return?: string; onboarded?: string; unavailable?: string };
}) {
  const seller = await requireSeller();
  if (searchParams.return) await syncStripeAccount(seller.makerId);
  const [maker, stats, orders] = await Promise.all([
    getSellerMaker(seller),
    getSellerStats(seller),
    getSellerOrders(seller),
  ]);
  return (
    <div className="space-y-8">
      <h1 className="text-[40px] leading-none md:text-[48px]">Payouts</h1>
      {searchParams.unavailable && (
        <p className="bg-stone-light px-3 py-2.5 text-[13px]" role="status">
          Payout setup opens shortly before launch. We’ll email you when it’s ready.
        </p>
      )}
      <section className="card flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="font-medium">Stripe Express account</p>
          <p className="text-sm text-ink-muted">
            {maker.stripeOnboardingComplete
              ? maker.stripePayoutsEnabled
                ? 'Connected — payouts go to your bank on Stripe’s schedule.'
                : 'Connected — Stripe is verifying your details.'
              : 'Connect a Stripe Express account so we can pay you for each order.'}
          </p>
        </div>
        {maker.stripeOnboardingComplete ? (
          <form action={openStripeDashboardAction}>
            <SubmitButton variant="secondary" pendingLabel="Opening…">
              Open Stripe Express dashboard
            </SubmitButton>
          </form>
        ) : (
          <form action={startPayoutOnboardingAction}>
            <SubmitButton pendingLabel="Opening Stripe…">
              {maker.stripeAccountId ? 'Continue payout setup' : 'Set up payouts'}
            </SubmitButton>
          </form>
        )}
      </section>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Gross sales (incl. shipping)" value={formatPrice(stats.grossCents)} />
        <Stat label="Platform commission (15%)" value={`−${formatPrice(stats.commissionCents)}`} />
        <Stat label="Stripe fees" value="A$0" hint="Card fees are paid by the platform" />
        <Stat label="Refunds" value={`−${formatPrice(stats.refundsCents)}`} />
        <Stat
          label="Net payout"
          value={formatPrice(stats.netCents)}
          hint="After commission and refund reversals"
        />
      </div>
      <section>
        <h2 className="mb-4 text-[28px] leading-none">Transfers by order</h2>
        <div className="overflow-x-auto rounded-2xl border border-stone/70 bg-white">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-stone/70 text-xs text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">Gross</th>
                <th className="px-4 py-3 font-medium">Commission</th>
                <th className="px-4 py-3 font-medium">Net</th>
                <th className="px-4 py-3 font-medium">Transfer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone/60">
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-2.5">{o.orderNumber}</td>
                  <td className="px-4 py-2.5">{formatPrice(o.subtotalCents + o.shippingCents)}</td>
                  <td className="px-4 py-2.5 text-ink-muted">
                    −{formatPrice(o.platformCommissionCents)}
                  </td>
                  <td className="px-4 py-2.5">{formatPrice(o.sellerNetCents)}</td>
                  <td className="px-4 py-2.5">
                    <StatusPill
                      status={o.transferStatus === 'created' ? 'paid' : o.transferStatus}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          Payouts from your Stripe balance to your bank are managed by Stripe. Refunds reverse the
          matching share of a transfer.
        </p>
      </section>
    </div>
  );
}
