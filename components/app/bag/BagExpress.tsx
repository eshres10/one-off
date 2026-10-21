'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { CheckoutView } from '@/lib/services/checkout';
import type { PaymentsConfig } from '@/components/checkout/CheckoutClient';
import { ExpressButtons } from '@/components/checkout/Express';
import { StripeProvider } from '@/components/checkout/StripeProvider';
import { toast } from '../Toast';
import { appButtonLinkClass } from '../classes';

/**
 * Apple Pay / Google Pay on the bag (Stripe's Express Checkout Element, only where the device
 * has a wallet), then the "Order placed" state with "Track my order".
 */
export function BagExpress({ view, payments }: { view: CheckoutView; payments: PaymentsConfig }) {
  const [placed, setPlaced] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (placed)
    return (
      <div
        className="rounded-app bg-ink px-5 py-6 text-ground"
        data-testid="order-placed"
        role="status"
      >
        <p className="text-[10px] uppercase tracking-[0.2em] text-ground/70">Order {placed}</p>
        <p className="mt-2 font-display text-[30px] leading-none">Order placed.</p>
        <p className="mt-2 text-[13px] text-ground/80">
          Your payment is held until it arrives. Each maker ships their piece separately.
        </p>
        <Link
          href="/you?tab=orders"
          className={appButtonLinkClass('ink', 'mt-5 w-full bg-ground !text-ink')}
          data-testid="track-my-order"
        >
          Track my order
        </Link>
      </div>
    );
  const inner = (
    <ExpressButtons
      view={view}
      payments={payments}
      setBusy={setBusy}
      onPaid={(n) => {
        toast('Paid');
        setPlaced(n);
      }}
      className={busy ? 'opacity-60' : ''}
    />
  );
  return payments.driver === 'stripe' && payments.publishableKey ? (
    <StripeProvider view={view} publishableKey={payments.publishableKey}>
      {inner}
    </StripeProvider>
  ) : (
    inner
  );
}
