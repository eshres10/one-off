'use client';

import { useFormState } from 'react-dom';
import { fulfilmentAction } from '@/lib/actions/seller';
import type { FormState } from '@/lib/validation';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Field, FormAlert, Input, Select } from '@/components/ui/Field';

const CARRIERS = [
  'Australia Post',
  'Sendle',
  'StarTrack',
  'Aramex',
  'CouriersPlease',
  'DHL Express',
];

export function FulfilmentActions({
  fulfilmentId,
  status,
}: {
  fulfilmentId: string;
  status: string;
}) {
  const [state, action] = useFormState<FormState, FormData>(fulfilmentAction, undefined);
  return (
    <div className="space-y-4">
      <FormAlert message={state?.message} tone={state?.ok ? 'success' : 'error'} />
      {status === 'paid' && (
        <form action={action}>
          <input type="hidden" name="fulfilmentId" value={fulfilmentId} />
          <input type="hidden" name="action" value="preparing" />
          <SubmitButton variant="secondary" size="sm">
            Mark as preparing
          </SubmitButton>
        </form>
      )}
      {(status === 'paid' || status === 'preparing') && (
        <form action={action} className="card space-y-3 p-4">
          <p className="text-sm font-medium">Add tracking & mark shipped</p>
          <input type="hidden" name="fulfilmentId" value={fulfilmentId} />
          <input type="hidden" name="action" value="shipped" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Carrier" name="carrier" error={state?.errors?.carrier}>
              <Select name="carrier" defaultValue="Australia Post">
                {CARRIERS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field
              label="Tracking number"
              name="trackingNumber"
              error={state?.errors?.trackingNumber}
            >
              <Input
                name="trackingNumber"
                required
                minLength={4}
                maxLength={60}
                autoComplete="off"
              />
            </Field>
          </div>
          <SubmitButton size="sm" pendingLabel="Updating…">
            Mark as shipped
          </SubmitButton>
        </form>
      )}
      {status === 'shipped' && (
        <form action={action}>
          <input type="hidden" name="fulfilmentId" value={fulfilmentId} />
          <input type="hidden" name="action" value="delivered" />
          <SubmitButton size="sm" pendingLabel="Updating…">
            Mark as delivered
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
