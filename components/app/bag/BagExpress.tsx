'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { CheckoutView } from '@/lib/services/checkout';
import type { PaymentsConfig } from '@/components/checkout/CheckoutClient';
import { ExpressButtons } from '@/components/checkout/Express';
import { StripeProvider } from '@/components/checkout/StripeProvider';
import { toast } from '../Toast';
import { OrderPlaced } from './OrderPlaced';

/**
 * Apple Pay / Google Pay on the bag (Stripe's Express Checkout Element, only where the device
 * has a wallet), then the "Order placed" state with "Track my order" (also at /bag?placed=…).
 */
export function BagExpress({ view, payments }: { view: CheckoutView; payments: PaymentsConfig }) {
  const router = useRouter();
  const [placed, setPlaced] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (placed) return <OrderPlaced number={placed} />;
  const inner = (
    <ExpressButtons
      view={view}
      payments={payments}
      setBusy={setBusy}
      onPaid={(n) => {
        toast('Paid');
        setPlaced(n);
        // The bag is empty now; the URL keeps "Order placed" on screen through any re-render.
        router.replace(`/bag?placed=${encodeURIComponent(n)}`);
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
