'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { checkoutAction } from '@/lib/actions/cart';
import type { FormState } from '@/lib/validation';

function Pay({ disabled, total }: { disabled: boolean; total: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="glass-dark min-h-[56px] w-full text-[12px] uppercase tracking-[0.2em] disabled:opacity-60"
      data-testid="checkout-button"
    >
      {pending ? 'Opening secure checkout…' : `Checkout · ${total}`}
    </button>
  );
}

function Wallet({ label, disabled }: { label: string; disabled: boolean }) {
  const { pending } = useFormStatus();
  // Wallets are offered on Stripe's hosted Checkout page; these start the same checkout.
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="min-h-[48px] flex-1 border border-ink bg-surface text-[14px] font-normal disabled:opacity-60"
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
  return (
    <form action={action} className="space-y-2">
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
      <Pay disabled={disabled} total={total} />
      <div className="flex gap-2">
        <Wallet label="Apple Pay" disabled={disabled} />
        <Wallet label="Google Pay" disabled={disabled} />
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
