'use client';

import { useFormState } from 'react-dom';
import { refundAction } from '@/lib/actions/admin';
import type { FormState } from '@/lib/validation';
import { SubmitButton } from '@/components/ui/SubmitButton';

export function RefundForm({
  orderItemId,
  remainingCents,
}: {
  orderItemId: string;
  remainingCents: number;
}) {
  const [state, action] = useFormState<FormState, FormData>(refundAction, undefined);
  if (remainingCents <= 0) return <span className="text-xs text-ink-muted">Fully refunded</span>;
  return (
    <form action={action} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="orderItemId" value={orderItemId} />
      <input
        name="amount"
        type="number"
        step="0.01"
        min="0.01"
        max={remainingCents / 100}
        placeholder={`Full (${(remainingCents / 100).toFixed(2)})`}
        aria-label="Refund amount in dollars"
        className="input w-28 py-1 text-xs"
      />
      <input
        name="reason"
        required
        placeholder="Reason"
        aria-label="Refund reason"
        className="input w-32 py-1 text-xs"
      />
      <SubmitButton
        size="sm"
        variant="danger"
        pendingLabel="Refunding…"
        className="!h-7 !px-3 !text-xs"
      >
        Refund
      </SubmitButton>
      {state?.message && (
        <span className={`text-xs ${state.ok ? 'text-moss' : 'text-alert'}`}>{state.message}</span>
      )}
    </form>
  );
}
