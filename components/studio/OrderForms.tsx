'use client';

import { useState, useTransition } from 'react';
import { useFormState } from 'react-dom';
import { makingStepAction, shipOrderAction } from '@/lib/actions/studio-orders';
import { showToast } from '@/lib/studio/toast';
import type { FormState } from '@/lib/validation';

const CARRIER_CHOICES = [
  { value: 'auspost', label: 'Australia Post' },
  { value: 'sendle', label: 'Sendle' },
  { value: 'hand', label: 'Hand delivered' },
] as const;

function SubmitShip({ pending }: { pending: boolean }) {
  return (
    <button
      type="submit"
      disabled={pending}
      data-testid="mark-shipped"
      className="glass-dark min-h-[52px] w-full px-5 text-[11px] uppercase tracking-[0.18em] disabled:opacity-60"
    >
      {pending ? 'Saving…' : 'Mark shipped & email buyer'}
    </button>
  );
}

/** Carrier chips, tracking number and "Mark shipped & email buyer". */
export function ShipForm({
  fulfilmentId,
  onShipped,
}: {
  fulfilmentId: string;
  onShipped?: () => void;
}) {
  const [state, setState] = useState<FormState>(undefined);
  const [pending, start] = useTransition();
  const [carrier, setCarrier] = useState<string>('auspost');
  // The order re-renders as shipped (and this form goes away), so the toast is raised here.
  const action = (fd: FormData) =>
    start(async () => {
      const res = await shipOrderAction(undefined, fd);
      if (res?.ok) {
        showToast(res.message ?? 'Shipped.');
        onShipped?.();
      } else setState(res);
    });
  const err = state?.ok === false ? (state.errors?.carrier ?? state.message) : null;
  return (
    <>
      <form action={action} className="space-y-4" data-testid="ship-form">
        <input type="hidden" name="fulfilmentId" value={fulfilmentId} />
        <fieldset>
          <legend className="label">Sent with</legend>
          <div className="flex flex-wrap gap-2">
            {CARRIER_CHOICES.map((c) => (
              <label
                key={c.value}
                className={`flex min-h-[44px] cursor-pointer items-center rounded-circle border px-4 text-[12px] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink ${carrier === c.value ? 'border-ink bg-ink text-ground' : 'border-line-strong hover:border-ink'}`}
              >
                <input
                  type="radio"
                  name="carrier"
                  value={c.value}
                  checked={carrier === c.value}
                  onChange={() => setCarrier(c.value)}
                  className="sr-only"
                />
                {c.label}
              </label>
            ))}
          </div>
        </fieldset>
        {carrier !== 'hand' && (
          <div>
            <label htmlFor={`tracking-${fulfilmentId}`} className="label">
              Tracking number
            </label>
            <input
              id={`tracking-${fulfilmentId}`}
              name="trackingNumber"
              required
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder={carrier === 'sendle' ? 'SNXV6R' : '33LGV5000…'}
              className="input"
              aria-invalid={err ? true : undefined}
              aria-describedby={err ? `ship-error-${fulfilmentId}` : undefined}
              data-testid="tracking-number"
            />
          </div>
        )}
        {err && (
          <p
            id={`ship-error-${fulfilmentId}`}
            className="text-[12px] text-alert"
            role="alert"
            data-testid="ship-error"
          >
            {err}
          </p>
        )}
        <SubmitShip pending={pending} />
      </form>
    </>
  );
}

const STEPS = ['Ordered', 'Cutting', 'Sewing', 'Ready'];

/** Made-to-order progress buttons; the buyer sees the same steps on their order page. */
export function MakingSteps({ fulfilmentId, step }: { fulfilmentId: string; step: number }) {
  const [state, action] = useFormState<FormState, FormData>(makingStepAction, undefined);
  return (
    <form action={action}>
      <input type="hidden" name="fulfilmentId" value={fulfilmentId} />
      <div className="grid grid-cols-4 gap-1" role="group" aria-label="Making progress">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="submit"
            name="step"
            value={i}
            aria-pressed={i === step}
            data-testid={`making-step-${i}`}
            className={`min-h-[44px] border px-1 text-[11px] uppercase tracking-[0.1em] ${i <= step ? 'border-ink bg-ink text-ground' : 'border-line-strong hover:border-ink'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {state?.ok === false && (
        <p className="mt-2 text-[12px] text-alert" role="alert">
          {state.message}
        </p>
      )}
    </form>
  );
}
