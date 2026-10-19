'use client';

import { ExpressCheckoutElement, useElements, useStripe } from '@stripe/react-stripe-js';
import type {
  StripeExpressCheckoutElementConfirmEvent,
  StripeExpressCheckoutElementShippingAddressChangeEvent,
} from '@stripe/stripe-js';
import { useState, useTransition } from 'react';
import {
  expressCheckoutAction,
  expressQuoteAction,
  mockExpressAction,
} from '@/lib/actions/checkout';
import type { CheckoutView } from '@/lib/services/checkout';
import type { PaymentsConfig } from './CheckoutClient';
import { useStripeReady } from './StripeProvider';

type Props = {
  view: CheckoutView;
  payments: PaymentsConfig;
  onPaid: (orderNumber: string) => void;
  setBusy: (b: boolean) => void;
  className?: string;
};

function Divider() {
  return (
    <p className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-label text-muted-2">
      <span className="h-px flex-1 bg-line" />
      Or check out below
      <span className="h-px flex-1 bg-line" />
    </p>
  );
}

/**
 * Express checkout above section 01: the wallet supplies the email, phone and delivery address,
 * so a returning Apple Pay buyer goes from the bag to "Thank you" in two taps.
 */
export function ExpressButtons(props: Props) {
  return useStripeReady() ? <LiveExpress {...props} /> : <MockExpress {...props} />;
}

function LiveExpress({ view, onPaid, setBusy, className = '' }: Props) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(false);

  const onShippingAddressChange = async (
    e: StripeExpressCheckoutElementShippingAddressChangeEvent,
  ) => {
    const res = await expressQuoteAction(e.address.state ?? '');
    if (!res.ok) return e.reject();
    elements?.update({ amount: res.view.totalCents });
    e.resolve({
      shippingRates: [
        {
          id: 'standard',
          displayName: `Standard delivery from ${view.parcels.length} ${view.parcels.length === 1 ? 'maker' : 'makers'}`,
          amount: res.view.shippingCents,
        },
      ],
    });
  };

  const onConfirm = async (e: StripeExpressCheckoutElementConfirmEvent) => {
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);
    try {
      const { error: submitError } = await elements.submit();
      if (submitError) return setError(submitError.message ?? 'Payment didn’t start.');
      const ship = e.shippingAddress;
      const res = await expressCheckoutAction({
        email: e.billingDetails?.email ?? '',
        phone: e.billingDetails?.phone ?? '',
        address: {
          name: ship?.name ?? e.billingDetails?.name ?? '',
          line1: ship?.address.line1 ?? '',
          line2: ship?.address.line2 ?? '',
          suburb: ship?.address.city ?? '',
          state: (ship?.address.state ?? '').toUpperCase(),
          postcode: ship?.address.postal_code ?? '',
        },
      });
      if (!res.ok) {
        e.paymentFailed({ reason: 'fail' });
        return setError(res.message);
      }
      const { error: payError } = await stripe.confirmPayment({
        elements,
        clientSecret: res.view.clientSecret,
        redirect: 'if_required',
        confirmParams: {
          return_url: `${window.location.origin}/checkout/confirmed/${res.view.orderNumber}`,
        },
      });
      if (payError) return setError(payError.message ?? 'Your payment didn’t go through.');
      onPaid(res.view.orderNumber);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`${shown ? '' : 'hidden'} ${className}`} data-testid="express-checkout">
      <ExpressCheckoutElement
        options={{
          buttonHeight: 48,
          buttonTheme: { applePay: 'black', googlePay: 'black', paypal: 'black' },
          paymentMethodOrder: ['apple_pay', 'google_pay', 'paypal'],
          emailRequired: true,
          phoneNumberRequired: true,
          shippingAddressRequired: true,
          allowedShippingCountries: ['AU'],
          shippingRates: [
            { id: 'standard', displayName: 'Standard delivery', amount: view.shippingCents },
          ],
        }}
        onReady={(e) => setShown(Boolean(e.availablePaymentMethods))}
        onShippingAddressChange={onShippingAddressChange}
        onConfirm={onConfirm}
      />
      {error && (
        <p className="mt-2 text-[13px] text-error" role="alert">
          {error}
        </p>
      )}
      <Divider />
    </div>
  );
}

/** Local and test builds: stand-ins for the wallet buttons that pay with a test wallet. */
function MockExpress({ onPaid, setBusy, className = '' }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const pay = () => {
    setBusy(true);
    start(async () => {
      const res = await mockExpressAction();
      setBusy(false);
      if (!res.ok) setError(res.message);
      else onPaid(res.view.orderNumber);
    });
  };
  return (
    <div className={className} data-testid="express-checkout">
      <div className="grid grid-cols-2 gap-2">
        {['Apple Pay', 'Google Pay'].map((w) => (
          <button
            key={w}
            type="button"
            onClick={pay}
            disabled={pending}
            className="flex min-h-[48px] items-center justify-center bg-ink text-[14px] text-ground disabled:opacity-60"
            data-testid={`express-${w === 'Apple Pay' ? 'apple' : 'google'}`}
          >
            {pending ? 'Paying…' : w}
          </button>
        ))}
      </div>
      {error && (
        <p className="mt-2 text-[13px] text-error" role="alert">
          {error}
        </p>
      )}
      <Divider />
    </div>
  );
}
