import { BRAND } from '@/lib/brand';
import { notFound } from 'next/navigation';
import { mockPaymentsReachable } from '@/lib/features';
import { formatPrice } from '@/lib/domain/money';
import { payments } from '@/lib/payments';
import { mockPayAction } from '@/lib/actions/dev';
import type { CheckoutLineItem } from '@/lib/payments/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Test checkout', robots: { index: false } };

/**
 * Local stand-in for Stripe-hosted Checkout (PAYMENTS_DRIVER=mock only). Mirrors what the buyer
 * sees on Stripe: line items, shipping, total, contact + AU shipping address, and card entry.
 */
export default async function MockCheckoutPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { declined?: string };
}) {
  if (!mockPaymentsReachable()) notFound();
  const session = (await payments()
    .retrieveCheckoutSession(params.id)
    .catch(() => null)) as
    | (Awaited<ReturnType<ReturnType<typeof payments>['retrieveCheckoutSession']>> & {
        lineItems: CheckoutLineItem[];
        shippingCents: number;
        shippingLabel: string;
        cancelUrl: string;
        submitMessage?: string;
        termsUrl?: string;
      })
    | null;
  if (!session) notFound();
  const input = 'input py-2';
  return (
    <main className="min-h-screen bg-white">
      <div className="bg-[#635BFF] px-4 py-2 text-center text-xs font-medium text-white">
        TEST MODE — simulated Stripe Checkout (no real payment)
      </div>
      <div className="mx-auto grid max-w-5xl gap-10 px-4 py-10 md:grid-cols-2">
        <section aria-label="Order summary">
          <a href={session.cancelUrl} className="text-sm text-ink-muted hover:underline">
            ← Back to bag
          </a>
          <p className="mt-6 text-sm text-ink-muted">Pay {BRAND.name}</p>
          <p className="text-4xl font-semibold" data-testid="mock-total">
            {formatPrice(session.amountTotal)}
          </p>
          <ul className="mt-6 space-y-3 text-sm">
            {session.lineItems.map((li, i) => (
              <li key={i} className="flex justify-between gap-4">
                <span>
                  {li.name} <span className="text-ink-muted">× {li.quantity}</span>
                  <span className="block text-xs text-ink-muted">{li.description}</span>
                </span>
                <span>{formatPrice(li.amountCents * li.quantity)}</span>
              </li>
            ))}
            <li className="flex justify-between border-t pt-3">
              <span>{session.shippingLabel}</span>
              <span>{formatPrice(session.shippingCents)}</span>
            </li>
          </ul>
        </section>
        <form action={mockPayAction} className="space-y-4">
          <input type="hidden" name="sessionId" value={session.id} />
          <div className="rounded-lg bg-stone-light p-3 text-center text-sm">
            Pay &nbsp;·&nbsp; G Pay{' '}
            <span className="text-ink-muted">(available on supported devices)</span>
          </div>
          {searchParams.declined && (
            <p className="rounded bg-alert-light p-2 text-sm text-alert" role="alert">
              Your card was declined. Try 4242 4242 4242 4242.
            </p>
          )}
          <label className="block text-sm">
            Email
            <input
              name="email"
              type="email"
              required
              defaultValue={session.customerEmail ?? ''}
              className={input}
            />
          </label>
          <fieldset className="space-y-2">
            <legend className="text-sm">Shipping address (Australia)</legend>
            <input
              name="name"
              required
              placeholder="Full name"
              aria-label="Full name"
              className={input}
            />
            <input
              name="line1"
              required
              placeholder="Address"
              aria-label="Address"
              className={input}
            />
            <div className="grid grid-cols-3 gap-2">
              <input
                name="city"
                required
                placeholder="Suburb"
                aria-label="Suburb"
                className={input}
              />
              <select name="state" aria-label="State" className={input} defaultValue="VIC">
                {['VIC', 'NSW', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <input
                name="postalCode"
                required
                placeholder="Postcode"
                aria-label="Postcode"
                pattern="\d{4}"
                className={input}
              />
            </div>
          </fieldset>
          <label className="block text-sm">
            Card information
            <input
              name="card"
              required
              defaultValue="4242 4242 4242 4242"
              className={input}
              inputMode="numeric"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <input defaultValue="12 / 34" aria-label="Expiry" className={input} />
            <input defaultValue="123" aria-label="CVC" className={input} />
          </div>
          {session.termsUrl && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="tos" required className="mt-1" data-testid="mock-tos" />
              <span>
                I agree to the{' '}
                <a href={session.termsUrl} className="underline">
                  One Off terms
                </a>
                , including the returns policy.
              </span>
            </label>
          )}
          {session.submitMessage && (
            <p className="text-sm text-ink-muted" data-testid="mock-submit-message">
              {session.submitMessage}
            </p>
          )}
          <button
            type="submit"
            className="h-12 w-full rounded-md bg-[#635BFF] font-medium text-white"
            data-testid="mock-pay"
          >
            Pay {formatPrice(session.amountTotal)}
          </button>
          <p className="text-center text-xs text-ink-muted">
            Use 4000 0000 0000 0002 to simulate a decline.
          </p>
        </form>
      </div>
    </main>
  );
}
