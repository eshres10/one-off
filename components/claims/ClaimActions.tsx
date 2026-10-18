'use client';

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { resolveClaimAction, respondClaimAction } from '@/lib/actions/claims';
import { PROPOSAL_LABEL, type ClaimProposal } from '@/lib/domain/claims';
import { formatPrice } from '@/lib/domain/money';
import type { FormState } from '@/lib/validation';
import { FormAlert } from '@/components/ui/Field';
import { SubmitButton } from '@/components/ui/SubmitButton';

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 text-[12px] text-error" role="alert">
      {message}
    </p>
  );
}

/** Maker replies with a proposed remedy. */
export function RespondForm({ claimId, custom }: { claimId: string; custom: boolean }) {
  const [state, action] = useFormState<FormState, FormData>(respondClaimAction, undefined);
  const e = state?.errors ?? {};
  const options = (Object.keys(PROPOSAL_LABEL) as ClaimProposal[]).filter(
    (p) => custom || p !== 'alteration',
  );
  return (
    <form action={action} className="space-y-4" aria-labelledby="respond-title">
      <h2 id="respond-title" className="text-[24px] leading-none">
        Reply to the buyer
      </h2>
      <input type="hidden" name="claimId" value={claimId} />
      <fieldset aria-describedby={e.proposal ? 'proposal-error' : undefined}>
        <legend className="label">What will you do?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {options.map((p) => (
            <label
              key={p}
              className="flex min-h-[48px] items-center gap-3 border border-line bg-surface px-4 has-[:checked]:border-ink"
            >
              <input type="radio" name="proposal" value={p} required className="accent-ink" />
              <span className="text-[14px]">{PROPOSAL_LABEL[p]}</span>
            </label>
          ))}
        </div>
        <FieldError id="proposal-error" message={e.proposal} />
      </fieldset>
      <div>
        <label htmlFor="respond-message" className="label">
          Message
        </label>
        <textarea
          id="respond-message"
          name="message"
          rows={4}
          required
          minLength={10}
          className="input min-h-[100px]"
          placeholder="Sorry about this — send it back with the prepaid label and I’ll fix the seam within a week."
          aria-invalid={e.message ? true : undefined}
          aria-describedby={e.message ? 'message-error' : undefined}
        />
        <FieldError id="message-error" message={e.message} />
      </div>
      <FormAlert message={state?.message} tone={state?.ok ? 'success' : 'error'} />
      <SubmitButton size="md">Send reply</SubmitButton>
    </form>
  );
}

/**
 * Closes the claim. Makers can resolve with a remedy; admins can also close a claim without one
 * (with a reason) and choose a partial refund.
 */
export function ResolveForm({
  claimId,
  remainingCents,
  admin,
}: {
  claimId: string;
  remainingCents: number;
  admin: boolean;
}) {
  const [state, action] = useFormState<FormState, FormData>(resolveClaimAction, undefined);
  const [choice, setChoice] = useState<string>('');
  const e = state?.errors ?? {};
  const options: Array<[string, string]> = [
    ['repair', 'Repaired'],
    ['replace', 'Replaced'],
    ['refund', `Refund (up to ${formatPrice(remainingCents)})`],
    ...(admin ? ([['reject', 'Close without a remedy']] as Array<[string, string]>) : []),
  ];
  return (
    <form action={action} className="space-y-4" aria-labelledby="resolve-title">
      <h2 id="resolve-title" className="text-[24px] leading-none">
        Resolve
      </h2>
      <input type="hidden" name="claimId" value={claimId} />
      <fieldset aria-describedby={e.resolution ? 'resolution-error' : undefined}>
        <legend className="label">Outcome</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {options.map(([value, label]) => (
            <label
              key={value}
              className="flex min-h-[48px] items-center gap-3 border border-line bg-surface px-4 has-[:checked]:border-ink"
            >
              <input
                type="radio"
                name="resolution"
                value={value}
                required
                onChange={() => setChoice(value)}
                className="accent-ink"
              />
              <span className="text-[14px]">{label}</span>
            </label>
          ))}
        </div>
        <FieldError id="resolution-error" message={e.resolution} />
      </fieldset>
      {choice === 'refund' && (
        <div>
          <label htmlFor="resolve-refund" className="label">
            Refund amount (A$)
          </label>
          <input
            id="resolve-refund"
            name="refund"
            type="number"
            min={0.01}
            step="0.01"
            max={remainingCents / 100}
            defaultValue={(remainingCents / 100).toFixed(2)}
            className="input max-w-[200px]"
            aria-describedby="refund-hint"
          />
          <p id="refund-hint" className="mt-1.5 text-[12px] text-muted-2">
            Refunded to the buyer’s card through Stripe; the maker’s payout for this piece is
            reduced by their share.
          </p>
          <FieldError id="refund-error" message={e.refund} />
        </div>
      )}
      <div>
        <label htmlFor="resolve-note" className="label">
          Note to the buyer {choice === 'reject' ? '(required)' : '(optional)'}
        </label>
        <textarea
          id="resolve-note"
          name="note"
          rows={3}
          className="input min-h-[80px]"
          aria-invalid={e.note ? true : undefined}
          aria-describedby={e.note ? 'note-error' : undefined}
        />
        <FieldError id="note-error" message={e.note} />
      </div>
      <FormAlert message={state?.message} tone={state?.ok ? 'success' : 'error'} />
      <SubmitButton size="md" variant="secondary">
        Resolve claim
      </SubmitButton>
    </form>
  );
}
