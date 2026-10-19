'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useFormState, useFormStatus } from 'react-dom';
import { RETURNS } from '@/lib/content/returns';
import { checkoutAction } from '@/lib/actions/cart';
import type { FormState } from '@/lib/validation';

// Until the returns box is ticked the buttons are aria-disabled rather than disabled, so a
// click still reaches the form and can explain what's missing.
function Pay({ disabled, locked, total }: { disabled: boolean; locked: boolean; total: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-disabled={locked || undefined}
      className="glass-dark min-h-[56px] w-full text-[12px] uppercase tracking-[0.2em] disabled:opacity-60 aria-disabled:opacity-60"
      data-testid="checkout-button"
    >
      {pending ? 'Opening secure checkout…' : `Checkout · ${total}`}
    </button>
  );
}

function Wallet({
  label,
  disabled,
  locked,
}: {
  label: string;
  disabled: boolean;
  locked: boolean;
}) {
  const { pending } = useFormStatus();
  // Wallets are offered on Stripe's hosted Checkout page; these start the same checkout.
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-disabled={locked || undefined}
      className="min-h-[48px] flex-1 border border-ink bg-surface text-[14px] font-normal disabled:opacity-60 aria-disabled:opacity-60"
      aria-label={`Checkout with ${label}`}
    >
      {label}
    </button>
  );
}

export function CheckoutForm({
  signedInEmail,
  disabled,
  total,
}: {
  signedInEmail: string | null;
  disabled: boolean;
  total: string;
}) {
  const [state, action] = useFormState<FormState, FormData>(checkoutAction, undefined);
  const [ack, setAck] = useState(false);
  const [ackError, setAckError] = useState(false);
  const ackRef = useRef<HTMLInputElement>(null);
  const showAckError = ackError || Boolean(state?.errors?.returnsAck);
  return (
    <form
      action={action}
      className="space-y-2"
      onSubmit={(e) => {
        if (!ack) {
          e.preventDefault();
          setAckError(true);
          ackRef.current?.focus();
        }
      }}
    >
      {!signedInEmail && (
        <div className="pb-2">
          <label htmlFor="email" className="label">
            Email for your receipt (optional)
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            className="input"
            placeholder="you@example.com"
            aria-invalid={state?.errors?.email ? true : undefined}
          />
          {state?.errors?.email && (
            <p className="mt-1 text-[12px] text-error">{state.errors.email}</p>
          )}
        </div>
      )}
      <details className="pb-2">
        <summary className="min-h-[44px] cursor-pointer py-3 text-[13px]">Add a gift note</summary>
        <label htmlFor="giftNote" className="label">
          Gift note (the maker includes it)
        </label>
        <textarea
          id="giftNote"
          name="giftNote"
          maxLength={300}
          rows={3}
          className="input"
          placeholder="Happy birthday, love Sam"
        />
      </details>
      <div className="py-2">
        <div className="flex items-start gap-3">
          <input
            ref={ackRef}
            id="returnsAck"
            name="returnsAck"
            type="checkbox"
            checked={ack}
            onChange={(e) => {
              setAck(e.target.checked);
              if (e.target.checked) setAckError(false);
            }}
            aria-invalid={showAckError || undefined}
            aria-describedby={showAckError ? 'returnsAck-error' : undefined}
            className="mt-0.5 h-5 w-5 shrink-0 accent-ink"
          />
          <label htmlFor="returnsAck" className="text-[13px] leading-snug">
            {RETURNS.checkoutAck}{' '}
            <Link href="/returns" className="link">
              Returns policy
            </Link>
          </label>
        </div>
        {showAckError && (
          <p id="returnsAck-error" className="mt-2 text-[12px] text-error" role="alert">
            Please tick the box to confirm you understand the returns policy.
          </p>
        )}
      </div>
      <Pay disabled={disabled} locked={!ack} total={total} />
      <div className="flex gap-2">
        <Wallet label="Apple Pay" disabled={disabled} locked={!ack} />
        <Wallet label="Google Pay" disabled={disabled} locked={!ack} />
      </div>
      {state?.message && (
        <p className="bg-error-bg px-3 py-2.5 text-[13px] text-error" role="alert">
          {state.message}
        </p>
      )}
      <p className="pt-1 text-center text-[12px] text-muted">
        {signedInEmail ? `Signed in as ${signedInEmail}. ` : 'Guest checkout — no account needed. '}
        Secure payment by Stripe.
      </p>
    </form>
  );
}
