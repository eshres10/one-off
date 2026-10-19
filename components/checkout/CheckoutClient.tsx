'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { CheckoutView } from '@/lib/services/checkout';
import { formatPrice } from '@/lib/domain/money';
import { DeliveryStep } from './DeliveryStep';
import { DetailsStep } from './DetailsStep';
import { ExpressButtons } from './Express';
import { PaymentStep } from './PaymentStep';
import { StripeProvider } from './StripeProvider';
import { Summary, SummaryBar } from './Summary';

export type Step = 1 | 2 | 3;
export interface PaymentsConfig {
  driver: 'stripe' | 'mock';
  publishableKey: string | null;
  methods: readonly string[];
  afterpayInstalments: number;
  showGst: boolean;
}

const STEP_NAMES = ['Details', 'Delivery', 'Payment'] as const;
const STEP_TITLES = ['Your details', 'Delivery', 'Payment'] as const;

/**
 * Checkout: three numbered sections that open one at a time (desktop), or one step per screen
 * with a sticky button bar (phone). Every change goes through a server action that returns the
 * recomputed checkout, so prices and dates always come from the server.
 */
export function CheckoutClient({
  initial,
  payments,
}: {
  initial: CheckoutView;
  payments: PaymentsConfig;
}) {
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [open, setOpen] = useState<Step>(initial.signedIn && initial.step === 1 ? 2 : initial.step);
  const [busy, setBusy] = useState(false);

  // Signed-in buyers skip "Your details": it shows collapsed.
  useEffect(() => {
    if (view.signedIn && view.detailsDone && open === 1) setOpen(2);
  }, [view.signedIn, view.detailsDone, open]);

  const update = useCallback((next: CheckoutView) => setView(next), []);
  const go = (step: Step) => {
    setOpen(step);
    requestAnimationFrame(() =>
      document.getElementById(`checkout-step-${step}`)?.scrollIntoView({ block: 'start' }),
    );
  };
  const confirmed = (orderNumber: string) => router.push(`/checkout/confirmed/${orderNumber}`);

  const buttonLabel =
    open === 1 ? 'Continue to delivery' : open === 2 ? 'Continue to payment' : null;

  const section = (n: Step) => {
    const done = n === 1 ? view.detailsDone : n === 2 ? view.deliveryDone : false;
    const isOpen = open === n;
    const summary =
      n === 1
        ? [view.email, view.phone].filter(Boolean).join(' · ')
        : n === 2 && view.address
          ? `${view.address.name}, ${view.address.line1}${view.address.line2 ? ` ${view.address.line2}` : ''}, ${view.address.suburb} ${view.address.state} ${view.address.postcode} · ${view.parcels.length} ${view.parcels.length === 1 ? 'parcel' : 'parcels'}`
          : '';
    return (
      <section
        key={n}
        id={`checkout-step-${n}`}
        aria-labelledby={`checkout-step-${n}-title`}
        className={`scroll-mt-24 border-t border-line py-6 ${isOpen ? '' : 'max-md:hidden'}`}
        data-testid={`checkout-section-${n}`}
        data-open={isOpen || undefined}
      >
        <div className="flex items-baseline justify-between gap-4">
          <h2
            id={`checkout-step-${n}-title`}
            className={`flex items-baseline gap-3 font-display text-[28px] leading-none md:text-[32px] ${isOpen || done ? '' : 'text-muted-2'}`}
          >
            <span className="font-sans text-[11px] tracking-label text-muted-2">0{n}</span>
            {STEP_TITLES[n - 1]}
          </h2>
          {!isOpen && done && (
            <button
              type="button"
              onClick={() => go(n)}
              className="min-h-[44px] text-[12px] underline underline-offset-4"
              data-testid={`checkout-change-${n}`}
            >
              Change
            </button>
          )}
        </div>
        {!isOpen && done && summary && (
          <p className="mt-2 truncate text-[13px] text-muted" data-testid={`checkout-summary-${n}`}>
            {summary}
          </p>
        )}
        {isOpen && (
          <div className="checkout-step-in mt-5" key={`open-${n}`}>
            {n === 1 && (
              <DetailsStep
                view={view}
                onSaved={(v) => {
                  update(v);
                  go(2);
                }}
                setBusy={setBusy}
              />
            )}
            {n === 2 && (
              <DeliveryStep
                view={view}
                onChange={update}
                onSaved={(v) => {
                  update(v);
                  go(3);
                }}
                setBusy={setBusy}
              />
            )}
            {n === 3 && (
              <PaymentStep
                view={view}
                payments={payments}
                onChange={update}
                onPaid={confirmed}
                setBusy={setBusy}
              />
            )}
          </div>
        )}
      </section>
    );
  };

  const content = (
    <div className="mx-auto max-w-[1180px] px-4 pb-32 md:px-8 md:pb-20">
      <SummaryBar view={view} />
      {/* Phone: "Details · Delivery · Payment" */}
      <ol
        className="mt-4 flex items-center justify-center gap-2 text-[11px] uppercase tracking-label md:hidden"
        aria-label="Checkout steps"
      >
        {STEP_NAMES.map((name, i) => (
          <li key={name} className="flex items-center gap-2">
            {i > 0 && (
              <span aria-hidden className="text-muted-2">
                ·
              </span>
            )}
            <span
              className={i + 1 === open ? 'text-ink' : 'text-muted-2'}
              aria-current={i + 1 === open ? 'step' : undefined}
            >
              {name}
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-4 grid gap-10 md:mt-10 md:grid-cols-[minmax(0,1fr)_400px] lg:gap-16">
        <div className="min-w-0">
          {open !== 3 && (
            <ExpressButtons
              view={view}
              payments={payments}
              onPaid={confirmed}
              setBusy={setBusy}
              className={open === 1 ? '' : 'max-md:hidden'}
            />
          )}
          {view.hasHeld && (
            <p className="mb-4 bg-stone p-4 text-[13px]" role="alert" data-testid="held-message">
              Someone’s checking out with{' '}
              {view.parcels
                .flatMap((p) => p.items)
                .filter((i) => i.heldByOther)
                .map((i) => i.title)
                .join(', ')}
              . It’ll be free in a few minutes if they don’t.
            </p>
          )}
          {([1, 2, 3] as Step[]).map(section)}
        </div>
        <aside className="hidden md:block">
          <div className="sticky top-24">
            <Summary view={view} showGst={payments.showGst} />
          </div>
        </aside>
      </div>
      {/* Phone: the main button lives in a sticky glass bar. */}
      {buttonLabel && (
        <div className="glass-nav fixed inset-x-0 bottom-0 z-30 border-t border-line px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 md:hidden">
          <button
            type="submit"
            form={`checkout-form-${open}`}
            disabled={busy}
            className="glass-dark flex min-h-[52px] w-full items-center justify-center text-[11px] uppercase tracking-[0.18em] text-ground disabled:opacity-60"
            data-testid="checkout-sticky-button"
          >
            {busy ? 'Saving…' : buttonLabel}
          </button>
        </div>
      )}
    </div>
  );

  return payments.driver === 'stripe' && payments.publishableKey ? (
    <StripeProvider view={view} publishableKey={payments.publishableKey}>
      {content}
    </StripeProvider>
  ) : (
    content
  );
}

export const totalLabel = (cents: number) => formatPrice(cents);
