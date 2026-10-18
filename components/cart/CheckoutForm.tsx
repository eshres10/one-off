'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { checkoutAction } from '@/lib/actions/cart';
import type { FormState } from '@/lib/validation';
import { LockIcon } from '@/components/ui/icons';

function Pay({ disabled, total }: { disabled: boolean; total: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-ink text-[15px] font-medium text-paper hover:bg-ink-soft disabled:bg-ink-muted"
      data-testid="checkout-button"
    >
      <LockIcon width={16} height={16} />{' '}
      {pending ? 'Opening secure checkout…' : `Checkout · ${total}`}
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
    <form action={action} className="space-y-3">
      {!signedInEmail && (
        <div>
          <label htmlFor="email" className="label">
            Email for your receipt{' '}
            <span className="font-normal text-ink-muted">
              (optional — you can enter it at payment)
            </span>
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
          {state?.errors?.email && <p className="mt-1 text-sm text-alert">{state.errors.email}</p>}
        </div>
      )}
      <Pay disabled={disabled} total={total} />
      {state?.message && (
        <p className="rounded-lg bg-alert-light px-3 py-2 text-sm text-alert" role="alert">
          {state.message}
        </p>
      )}
      <p className="text-center text-xs text-ink-muted">
        {signedInEmail ? `Signed in as ${signedInEmail}. ` : 'Guest checkout — no account needed. '}
        Card, Apple Pay and Google Pay via Stripe.
      </p>
    </form>
  );
}
