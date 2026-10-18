'use client';

import { useFormState } from 'react-dom';
import { quoteAction } from '@/lib/actions/seller';
import type { FormState } from '@/lib/validation';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Field, FormAlert, Input, TextArea } from '@/components/ui/Field';

export function QuoteForm({ requestId }: { requestId: string }) {
  const [state, action] = useFormState<FormState, FormData>(quoteAction, undefined);
  const e = state?.errors ?? {};
  return (
    <form action={action} className="card space-y-4 p-5">
      <h2 className="font-sans text-base font-semibold">Send a quote</h2>
      <input type="hidden" name="requestId" value={requestId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Total price (A$)" name="totalPrice" error={e.totalPrice}>
          <Input name="totalPrice" type="number" min={1} step="0.01" required />
        </Field>
        <Field label="Deposit (A$)" name="deposit" error={e.deposit}>
          <Input name="deposit" type="number" min={0} step="0.01" required />
        </Field>
        <Field label="Production time (days)" name="productionDays" error={e.productionDays}>
          <Input name="productionDays" type="number" min={1} max={180} required />
        </Field>
        <Field label="Revisions included" name="revisionsIncluded" error={e.revisionsIncluded}>
          <Input
            name="revisionsIncluded"
            type="number"
            min={0}
            max={10}
            defaultValue={1}
            required
          />
        </Field>
        <Field label="Shipping (A$)" name="shipping" error={e.shipping}>
          <Input name="shipping" type="number" min={0} step="0.01" defaultValue={12} required />
        </Field>
        <Field
          label="Estimated delivery date"
          name="estimatedDeliveryDate"
          error={e.estimatedDeliveryDate}
        >
          <Input
            name="estimatedDeliveryDate"
            type="date"
            required
            min={new Date().toISOString().slice(0, 10)}
          />
        </Field>
      </div>
      <Field label="Message to the buyer" name="message" error={e.message}>
        <TextArea
          name="message"
          maxLength={2000}
          placeholder="What’s included, fittings, fabric sourcing…"
        />
      </Field>
      <FormAlert message={state?.message} tone={state?.ok ? 'success' : 'error'} />
      <SubmitButton pendingLabel="Sending…">Send quote</SubmitButton>
      <p className="text-xs text-ink-muted">
        Payment is coordinated by our concierge team via a Stripe payment link — never take payment
        directly.
      </p>
    </form>
  );
}
