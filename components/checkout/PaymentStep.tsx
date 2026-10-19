'use client';

import { PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import Link from 'next/link';
import { RETURNS } from '@/lib/content/returns';
import { useState, useTransition } from 'react';
import { mockPayAction, preparePaymentAction, setSaveDetailsAction } from '@/lib/actions/checkout';
import { formatPrice } from '@/lib/domain/money';
import type { CheckoutView } from '@/lib/services/checkout';
import { Switch } from '@/components/studio/Switch';
import type { PaymentsConfig } from './CheckoutClient';
import { stepButton } from './DetailsStep';
import { useStripeReady } from './StripeProvider';
import { Totals } from './Summary';

type Method = 'card' | 'afterpay_clearpay' | 'paypal' | string;

const payLabel = (method: Method, total: number) =>
  method === 'afterpay_clearpay'
    ? 'Continue to Afterpay'
    : method === 'paypal'
      ? 'Continue to PayPal'
      : `Pay ${formatPrice(total)}`;

/** The radios and card fields in local and test builds, laid out like the Payment Element. */
function MockMethods({
  view,
  method,
  setMethod,
  instalments,
}: {
  view: CheckoutView;
  method: Method;
  setMethod: (m: Method) => void;
  instalments: number;
}) {
  const option = (value: Method, title: string, body: string, children?: React.ReactNode) => (
    <div className={`border ${method === value ? 'border-ink' : 'border-line-strong'}`}>
      <label className="flex min-h-[56px] cursor-pointer items-center gap-3 px-4 text-[14px]">
        <input
          type="radio"
          name="pay-method"
          checked={method === value}
          onChange={() => setMethod(value)}
          className="accent-ink"
          data-testid={`method-${value}`}
        />
        <span>
          <span className="block">{title}</span>
          <span className="block text-[12px] text-muted">{body}</span>
        </span>
      </label>
      {method === value && children && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
  return (
    <div className="space-y-2" data-testid="payment-methods">
      {option(
        'card',
        'Card',
        'Visa, Mastercard, Amex',
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label htmlFor="mock-card" className="label">
              Card number
            </label>
            <input
              id="mock-card"
              defaultValue="4242 4242 4242 4242"
              inputMode="numeric"
              className="input bg-[#FBFAF8]"
            />
          </div>
          <div>
            <label htmlFor="mock-exp" className="label">
              Expiry
            </label>
            <input id="mock-exp" defaultValue="12 / 30" className="input bg-[#FBFAF8]" />
          </div>
          <div>
            <label htmlFor="mock-cvc" className="label">
              CVC
            </label>
            <input
              id="mock-cvc"
              defaultValue="123"
              inputMode="numeric"
              className="input bg-[#FBFAF8]"
            />
          </div>
          <p className="col-span-2 text-[11px] text-muted-2">
            Test mode: no real payment is taken.
          </p>
        </div>,
      )}
      {option(
        'afterpay_clearpay',
        'Afterpay',
        `${instalments} payments of ${formatPrice(Math.ceil(view.totalCents / instalments))}, interest-free`,
      )}
    </div>
  );
}

function StripeMethods({
  view,
  methods,
  sameAsDelivery,
  setMethod,
}: {
  view: CheckoutView;
  methods: readonly string[];
  sameAsDelivery: boolean;
  setMethod: (m: Method) => void;
}) {
  return (
    <PaymentElement
      options={{
        layout: {
          type: 'accordion',
          radios: true,
          spacedAccordionItems: true,
          defaultCollapsed: false,
        },
        paymentMethodOrder: [...methods],
        fields: {
          billingDetails: {
            address: sameAsDelivery ? 'never' : 'auto',
            email: 'never',
            phone: 'never',
          },
        },
        defaultValues: { billingDetails: { name: view.address?.name ?? '', email: view.email } },
        wallets: { applePay: 'never', googlePay: 'never' },
      }}
      onChange={(e) => setMethod(e.value.type)}
    />
  );
}

type Props = {
  view: CheckoutView;
  payments: PaymentsConfig;
  onChange: (v: CheckoutView) => void;
  onPaid: (orderNumber: string) => void;
  setBusy: (b: boolean) => void;
};

/** 03 Payment. */
export function PaymentStep(props: Props) {
  return useStripeReady() ? <LivePayment {...props} /> : <PaymentForm {...props} live={null} />;
}

/** Real Stripe: the Payment Element, confirmed against the order's PaymentIntent. */
function LivePayment(props: Props) {
  const stripe = useStripe();
  const elements = useElements();
  return <PaymentForm {...props} live={{ stripe, elements }} />;
}

function PaymentForm({
  view,
  payments,
  onChange,
  onPaid,
  setBusy,
  live,
}: Props & {
  live: { stripe: ReturnType<typeof useStripe>; elements: ReturnType<typeof useElements> } | null;
}) {
  const [method, setMethod] = useState<Method>('card');
  const [sameAsDelivery, setSameAsDelivery] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggleSave = (on: boolean) =>
    start(async () => {
      const res = await setSaveDetailsAction(on);
      if (res.ok) onChange(res.view);
    });

  const pay = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    start(async () => {
      try {
        if (!live) {
          const res = await mockPayAction(method);
          if (!res.ok) return setError(res.message);
          return onPaid(res.view.orderNumber);
        }
        const { stripe, elements } = live;
        if (!stripe || !elements)
          return setError('Payments are still loading. Try again in a moment.');
        const submitted = await elements.submit();
        if (submitted.error)
          return setError(submitted.error.message ?? 'Check your payment details.');
        const res = await preparePaymentAction(view.totalCents);
        if (!res.ok) return setError(res.message);
        const a = view.address!;
        const address = {
          line1: a.line1,
          line2: a.line2 || undefined,
          city: a.suburb,
          state: a.state,
          postal_code: a.postcode,
          country: 'AU',
        };
        const { error: payError } = await stripe.confirmPayment({
          elements,
          clientSecret: res.view.clientSecret,
          redirect: 'if_required',
          confirmParams: {
            return_url: `${window.location.origin}/checkout/confirmed/${res.view.orderNumber}`,
            shipping: { name: a.name, phone: view.phone || undefined, address },
            payment_method_data: {
              billing_details: {
                email: view.email,
                phone: view.phone || undefined,
                ...(sameAsDelivery ? { name: a.name, address } : {}),
              },
            },
          },
        });
        if (payError) return setError(payError.message ?? 'Your payment didn’t go through.');
        onPaid(res.view.orderNumber);
      } finally {
        setBusy(false);
      }
    });
  };

  return (
    <form id="checkout-form-3" onSubmit={pay} className="space-y-6" noValidate>
      {live ? (
        <StripeMethods
          view={view}
          methods={payments.methods.filter((m) => m !== 'apple_pay' && m !== 'google_pay')}
          sameAsDelivery={sameAsDelivery}
          setMethod={setMethod}
        />
      ) : (
        <MockMethods
          view={view}
          method={method}
          setMethod={setMethod}
          instalments={payments.afterpayInstalments}
        />
      )}
      <label className="flex min-h-[44px] items-center gap-3 text-[13px]">
        <input
          type="checkbox"
          checked={sameAsDelivery}
          onChange={(e) => setSameAsDelivery(e.target.checked)}
          className="h-4 w-4 accent-ink"
        />
        Billing address same as delivery
      </label>

      <p className="bg-stone p-4 text-[13px] leading-relaxed" data-testid="payment-reassurance">
        Your payment is held until your piece arrives. Faulty or not as described? We’ll make it
        right.
      </p>

      {!view.signedIn && (
        <div className="flex items-center justify-between gap-4 border-y border-line py-3">
          <span id="save-details-label" className="text-[14px]">
            Save my details for next time
            <span className="block text-[12px] text-muted">
              We’ll make your account with {view.email || 'your email'} and email you a sign-in
              link. No password, ever.
            </span>
          </span>
          <Switch
            checked={view.saveDetails}
            onChange={toggleSave}
            labelledBy="save-details-label"
            testId="save-details"
          />
        </div>
      )}

      <Totals view={view} showGst={payments.showGst} />

      <p className="text-[12px] leading-relaxed text-muted" data-testid="returns-small-print">
        By paying you agree to our{' '}
        <Link href="/terms" className="underline underline-offset-2">
          Terms
        </Link>
        . {RETURNS.checkoutFinePrint}
      </p>

      {error && (
        <p
          className="bg-error-bg px-3 py-2.5 text-[13px] text-error"
          role="alert"
          data-testid="payment-error"
        >
          {error}
        </p>
      )}

      {/* Desktop: in place. Phone: in the sticky glass bar. */}
      <button
        type="submit"
        disabled={pending || view.hasHeld}
        className={`${stepButton} max-md:hidden`}
        data-testid="pay-button"
      >
        {pending ? 'Paying…' : payLabel(method, view.totalCents)}
      </button>
      <div className="glass-nav fixed inset-x-0 bottom-0 z-30 border-t border-line px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 md:hidden">
        <button
          type="submit"
          disabled={pending || view.hasHeld}
          className={stepButton}
          data-testid="pay-button-phone"
        >
          {pending ? 'Paying…' : payLabel(method, view.totalCents)}
        </button>
      </div>
    </form>
  );
}
