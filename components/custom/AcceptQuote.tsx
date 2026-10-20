'use client';

import { PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { StripeElements, useStripeReady } from '@/components/checkout/StripeProvider';
import { mockPayCustomAction, prepareCustomPaymentAction } from '@/lib/actions/custom';
import { formatPrice } from '@/lib/domain/money';
import { CUSTOM } from '@/lib/custom/config';
import type { CheckoutAddress } from '@/lib/services/checkout';
import { SITE } from '@/lib/site/config';
import { Cap, Glass, Title, fieldClass } from './ui';

export interface AcceptProps {
  requestNumber: string;
  quoteId: string;
  makerName: string;
  piece: string;
  priceCents: number;
  shippingCents: number;
  address: CheckoutAddress | null;
  releaseDays: number;
  payments: { driver: 'stripe' | 'mock'; publishableKey: string | null };
}

const EMPTY: CheckoutAddress = {
  name: '',
  line1: '',
  line2: '',
  suburb: '',
  state: 'VIC',
  postcode: '',
};

/** 12 · Accept and pay: the summary, where it's going, how the money is held, and Pay. */
export function AcceptQuote(p: AcceptProps) {
  const total = p.priceCents + p.shippingCents;
  if (p.payments.driver === 'stripe' && p.payments.publishableKey)
    return (
      <StripeElements amountCents={total} save publishableKey={p.payments.publishableKey}>
        <LivePayment {...p} />
      </StripeElements>
    );
  return <AcceptForm {...p} live={null} />;
}

function LivePayment(p: AcceptProps) {
  const stripe = useStripe();
  const elements = useElements();
  return <AcceptForm {...p} live={{ stripe, elements }} />;
}

function AcceptForm({
  live,
  ...p
}: AcceptProps & {
  live: { stripe: ReturnType<typeof useStripe>; elements: ReturnType<typeof useElements> } | null;
}) {
  const router = useRouter();
  const ready = useStripeReady();
  const total = p.priceCents + p.shippingCents;
  const [address, setAddress] = useState<CheckoutAddress>(p.address ?? EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const field = (k: keyof CheckoutAddress, v: string) => setAddress((a) => ({ ...a, [k]: v }));
  const done = () => router.push(`/account/requests/${p.requestNumber}?paid=1`);

  const pay = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      if (!live || !ready) {
        const res = await mockPayCustomAction(p.quoteId, address);
        if (!res.ok) return setError(res.message);
        return done();
      }
      const { stripe, elements } = live;
      if (!stripe || !elements)
        return setError('Payments are still loading. Try again in a moment.');
      const submitted = await elements.submit();
      if (submitted.error)
        return setError(submitted.error.message ?? 'Check your payment details.');
      const res = await prepareCustomPaymentAction(p.quoteId, address);
      if (!res.ok) return setError(res.message);
      const a = res.value.address;
      const stripeAddress = {
        line1: a.line1,
        line2: a.line2 || undefined,
        city: a.suburb,
        state: a.state,
        postal_code: a.postcode,
        country: 'AU',
      };
      const { error: payError } = await stripe.confirmPayment({
        elements,
        clientSecret: res.value.clientSecret,
        redirect: 'if_required',
        confirmParams: {
          return_url: `${window.location.origin}/account/requests/${p.requestNumber}?paid=1`,
          shipping: { name: a.name, address: stripeAddress },
          payment_method_data: { billing_details: { name: a.name, address: stripeAddress } },
        },
      });
      if (payError) return setError(payError.message ?? 'Your payment didn’t go through.');
      done();
    });
  };

  const input = (
    k: keyof CheckoutAddress,
    label: string,
    extra: React.ComponentProps<'input'> = {},
  ) => (
    <label className="flex flex-col gap-1">
      <Cap>{label}</Cap>
      <input
        className={fieldClass}
        value={address[k]}
        onChange={(e) => field(k, e.target.value)}
        data-testid={`accept-${k}`}
        {...extra}
      />
    </label>
  );

  return (
    <form
      onSubmit={pay}
      className="step-in flex max-w-[640px] flex-col gap-4"
      noValidate
      data-testid="accept"
    >
      <Cap>Accept and pay</Cap>
      <Title plain={`${p.makerName} will`} italic="make it." />
      <div className="flex flex-col border-t border-ink text-[13px]">
        <div className="flex justify-between border-b border-line py-2.5">
          <span>{p.piece}</span>
          <span>{formatPrice(p.priceCents)}</span>
        </div>
        <div className="flex justify-between border-b border-line py-2.5">
          <span>Shipping, tracked</span>
          <span>{formatPrice(p.shippingCents)}</span>
        </div>
        <div className="flex justify-between py-3 text-[16px] font-medium">
          <span>Total today</span>
          <span data-testid="accept-total">{formatPrice(total)}</span>
        </div>
      </div>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="sr-only">Delivery address</legend>
        <Cap>Deliver to</Cap>
        {input('name', 'Name', { autoComplete: 'name' })}
        {input('line1', 'Street address', { autoComplete: 'address-line1' })}
        {input('line2', 'Apartment, unit (optional)', { autoComplete: 'address-line2' })}
        <div className="grid grid-cols-[1fr_88px_88px] gap-2">
          {input('suburb', 'Suburb', { autoComplete: 'address-level2' })}
          <label className="flex flex-col gap-1">
            <Cap>State</Cap>
            <select
              className={fieldClass}
              value={address.state}
              onChange={(e) => field('state', e.target.value)}
              data-testid="accept-state"
            >
              {SITE.makerRegions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          {input('postcode', 'Postcode', {
            inputMode: 'numeric',
            maxLength: 4,
            autoComplete: 'postal-code',
          })}
        </div>
      </fieldset>

      {live && ready && (
        <div>
          <Cap className="mb-2">Payment</Cap>
          <PaymentElement
            options={{
              layout: { type: 'accordion', radios: true, spacedAccordionItems: true },
              fields: { billingDetails: { address: 'never', email: 'never', phone: 'never' } },
              wallets: { applePay: 'auto', googlePay: 'auto' },
            }}
          />
        </div>
      )}
      {!(live && ready) && (
        <p className="border border-line-strong px-4 py-3 text-[13px]" data-testid="mock-card">
          Card · 4242 4242 4242 4242
          <span className="block text-[11px] text-muted-2">
            Test mode: no real payment is taken.
          </span>
        </p>
      )}

      <div className="flex flex-col gap-2 bg-stone-light p-3.5 text-[12px] leading-relaxed text-text2">
        <Cap>How your money is held</Cap>
        <span>
          <b className="font-medium">Off One holds your payment.</b> {p.makerName} gets{' '}
          {CUSTOM.advancePct}% when they buy your fabric, and the rest {p.releaseDays} days after it
          arrives.
        </span>
        <span>
          <b className="font-medium">Made just for you,</b>{' '}
          {'so there are no change-of-mind returns on custom pieces.'} If it’s faulty or not what
          you agreed, we’ll make it right.
        </span>
      </div>

      {error && (
        <p
          className="bg-error-bg px-3 py-2.5 text-[13px] text-error"
          role="alert"
          data-testid="accept-error"
        >
          {error}
        </p>
      )}
      <Glass type="submit" disabled={pending} className="w-full" data-testid="accept-pay">
        {pending ? 'Paying…' : `Pay ${formatPrice(total)}`}
      </Glass>
      <span className="text-center text-[11px] text-muted-2">
        The other makers will be told you’ve chosen someone else. By paying you agree to our{' '}
        <Link href="/legal/terms" className="underline underline-offset-2">
          Terms
        </Link>
        .
      </span>
    </form>
  );
}
