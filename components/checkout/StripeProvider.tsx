'use client';

import { Elements, useElements } from '@stripe/react-stripe-js';
import { loadStripe, type Appearance, type Stripe } from '@stripe/stripe-js';
import { createContext, useContext, useEffect, useMemo } from 'react';
import type { CheckoutView } from '@/lib/services/checkout';

const StripeReady = createContext(false);
/** True inside the real Stripe Elements provider (false in local and test builds). */
export const useStripeReady = () => useContext(StripeReady);

let stripePromise: Promise<Stripe | null> | null = null;
const stripeFor = (key: string) => (stripePromise ??= loadStripe(key));

/** Off One's look for Stripe's fields: square corners, Jost, stone fields that turn ink on focus. */
export const APPEARANCE: Appearance = {
  theme: 'flat',
  variables: {
    fontFamily: 'Jost, "Helvetica Neue", Helvetica, Arial, sans-serif',
    fontSizeBase: '14px',
    fontWeightNormal: '300',
    colorPrimary: '#111111',
    colorText: '#111111',
    colorTextSecondary: '#4a4743',
    colorBackground: '#FBFAF8',
    colorDanger: '#9B2C2C',
    borderRadius: '0px',
    spacingUnit: '4px',
  },
  rules: {
    '.Input': { border: '1px solid #CFCAC2', boxShadow: 'none', padding: '12px' },
    '.Input:focus': { border: '1px solid #111111', boxShadow: 'none' },
    '.Label': {
      fontSize: '11px',
      textTransform: 'uppercase',
      letterSpacing: '0.14em',
      color: '#6B6762',
    },
    '.AccordionItem': { border: '1px solid #CFCAC2', borderRadius: '0px', boxShadow: 'none' },
    '.AccordionItem--selected': { border: '1px solid #111111' },
  },
};

/** Keeps the Elements amount in step with the server's total (deferred-intent mode). */
function AmountSync({ amount, save }: { amount: number; save: boolean }) {
  const elements = useElements();
  useEffect(() => {
    elements?.update({ amount, setupFutureUsage: save ? 'on_session' : null });
  }, [elements, amount, save]);
  return null;
}

/**
 * Stripe Elements for the whole checkout, in deferred-intent mode: the Address Element, Payment
 * Element and Express Checkout Element render before the PaymentIntent exists; it's created (or
 * updated) on the server when the buyer pays, for the total the server works out.
 */
export function StripeProvider({
  view,
  publishableKey,
  children,
}: {
  view: CheckoutView;
  publishableKey: string;
  children: React.ReactNode;
}) {
  const save = view.signedIn || view.saveDetails;
  const options = useMemo(
    () => ({
      mode: 'payment' as const,
      amount: Math.max(50, view.totalCents),
      currency: 'aud',
      setupFutureUsage: save ? ('on_session' as const) : undefined,
      appearance: APPEARANCE,
      fonts: [
        { cssSrc: 'https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500&display=swap' },
      ],
    }),
    // Elements options are read once; later changes go through elements.update (AmountSync).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  return (
    <Elements stripe={stripeFor(publishableKey)} options={options}>
      <StripeReady.Provider value>
        <AmountSync amount={Math.max(50, view.totalCents)} save={save} />
        {children}
      </StripeReady.Provider>
    </Elements>
  );
}
