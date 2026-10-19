import { notFound } from 'next/navigation';
import { mockPaymentsReachable } from '@/lib/features';
import { mockCompleteOnboardingAction } from '@/lib/actions/dev';

export const dynamic = 'force-dynamic';

/** Local stand-in for Stripe Connect Express onboarding / dashboard (PAYMENTS_DRIVER=mock). */
export default function MockConnectPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { dashboard?: string };
}) {
  if (!mockPaymentsReachable()) notFound();
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <div className="mb-6 rounded bg-[#635BFF] px-3 py-2 text-center text-xs font-medium text-white">
        TEST MODE — simulated Stripe Express
      </div>
      {searchParams.dashboard ? (
        <>
          <h1 className="text-[32px] leading-none">Express dashboard</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Account {params.id}. In production this opens Stripe’s Express dashboard with balances
            and payouts.
          </p>
          <a href="/studio/payouts" className="mt-6 inline-block underline">
            Back to payouts
          </a>
        </>
      ) : (
        <form action={mockCompleteOnboardingAction} className="space-y-4">
          <h1 className="text-[32px] leading-none">Set up payouts</h1>
          <p className="text-sm text-ink-muted">
            Stripe would collect your ABN, identity and bank details here.
          </p>
          <input type="hidden" name="accountId" value={params.id} />
          <button
            type="submit"
            className="h-11 w-full rounded-md bg-[#635BFF] font-medium text-white"
          >
            Complete test onboarding
          </button>
        </form>
      )}
    </main>
  );
}
