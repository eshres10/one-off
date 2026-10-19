'use client';

import { useState } from 'react';
import { useFormState } from 'react-dom';
import {
  approveAction,
  declineAction,
  internalNoteAction,
  requestChangesAction,
  spotCheckAction,
} from '@/lib/actions/applications';
import type { FormState } from '@/lib/validation';
import { TERMS } from '@/lib/studio/terms';
import { SubmitButton } from '@/components/ui/SubmitButton';

function Alert({ state }: { state: FormState }) {
  if (!state?.message) return null;
  return (
    <p
      className={`text-[13px] ${state.ok ? 'text-muted' : 'text-error'}`}
      role={state.ok ? 'status' : 'alert'}
    >
      {state.message}
    </p>
  );
}

type Panel = 'approve' | 'changes' | 'decline';

/** Approve (optionally with a founding spot), request changes, or decline with a reason. */
export function ApplicationActions({
  makerId,
  label,
  spotsLeft,
  reasons,
  foundingMonths,
  reapplyDays,
}: {
  makerId: string;
  label: string;
  spotsLeft: number;
  foundingMonths: number;
  reapplyDays: number;
  reasons: ReadonlyArray<{ value: string; label: string; text: string }>;
}) {
  const [open, setOpen] = useState<Panel>('approve');
  const [approveState, approve] = useFormState<FormState, FormData>(approveAction, undefined);
  const [changesState, changes] = useFormState<FormState, FormData>(
    requestChangesAction,
    undefined,
  );
  const [declineState, decline] = useFormState<FormState, FormData>(declineAction, undefined);
  const [reason, setReason] = useState('');
  const tab = (p: Panel, text: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={open === p}
      onClick={() => setOpen(p)}
      className={`min-h-[44px] flex-1 border-b-2 text-[11px] uppercase tracking-label ${open === p ? 'border-ink' : 'border-transparent text-muted'}`}
      data-testid={`decide-${p}`}
    >
      {text}
    </button>
  );
  return (
    <section className="border border-line bg-surface p-5" aria-label="Decision">
      <div className="flex gap-2 border-b border-line" role="tablist">
        {tab('approve', 'Approve')}
        {tab('changes', 'Request changes')}
        {tab('decline', 'Decline')}
      </div>
      {open === 'approve' && (
        <form action={approve} className="mt-5 space-y-4" role="tabpanel">
          <input type="hidden" name="makerId" value={makerId} />
          <label
            className={`flex items-start gap-3 text-[14px] ${spotsLeft ? '' : 'text-muted-2'}`}
          >
            <input
              type="checkbox"
              name="founding"
              disabled={!spotsLeft}
              className="mt-1"
              data-testid="approve-founding"
            />
            <span>
              Give {label} a founding maker spot
              <span className="block text-[12px] text-muted">
                {spotsLeft
                  ? `${spotsLeft} ${spotsLeft === 1 ? 'spot' : 'spots'} left. ${TERMS.foundingCommissionPct}% commission for their first ${foundingMonths} months, from when they go live.`
                  : 'All founding spots are taken.'}
              </span>
            </span>
          </label>
          <p className="text-[13px] text-muted">
            They get the “You’re in” email and can set up payouts and list pieces. Their first
            pieces are flagged for a spot check.
          </p>
          <Alert state={approveState} />
          <SubmitButton className="w-full" pendingLabel="Approving…" data-testid="approve">
            Approve
          </SubmitButton>
        </form>
      )}
      {open === 'changes' && (
        <form action={changes} className="mt-5 space-y-4" role="tabpanel">
          <input type="hidden" name="makerId" value={makerId} />
          <label htmlFor="changes-note" className="label">
            Note to the maker
          </label>
          <textarea
            id="changes-note"
            name="note"
            required
            minLength={5}
            maxLength={1000}
            rows={5}
            className="input min-h-[120px] py-3"
            placeholder="Could you add photos of finished pieces on a person or a hanger?"
            data-testid="changes-note"
          />
          <Alert state={changesState} />
          <SubmitButton className="w-full" pendingLabel="Sending…" data-testid="request-changes">
            Send to the maker
          </SubmitButton>
        </form>
      )}
      {open === 'decline' && (
        <form action={decline} className="mt-5 space-y-4" role="tabpanel">
          <input type="hidden" name="makerId" value={makerId} />
          <fieldset>
            <legend className="label">Reason</legend>
            <div className="space-y-2">
              {reasons.map((r) => (
                <label key={r.value} className="flex items-start gap-3 text-[14px]">
                  <input
                    type="radio"
                    name="reason"
                    value={r.value}
                    required
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="mt-1"
                    data-testid={`decline-${r.value}`}
                  />
                  <span>
                    {r.label}
                    {r.text && <span className="block text-[12px] text-muted">{r.text}</span>}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="decline-personal" className="label">
              Personal line {reason === 'other' ? '' : '(optional)'}
            </label>
            <textarea
              id="decline-personal"
              name="personal"
              rows={3}
              maxLength={600}
              required={reason === 'other'}
              className="input min-h-[88px] py-3"
            />
          </div>
          <p className="text-[12px] text-muted">
            They get a kind email and can apply again in {reapplyDays} days.
          </p>
          <Alert state={declineState} />
          <SubmitButton className="w-full" pendingLabel="Declining…" data-testid="decline">
            Decline
          </SubmitButton>
        </form>
      )}
    </section>
  );
}

export function InternalNote({ makerId, note }: { makerId: string; note: string }) {
  const [state, action] = useFormState<FormState, FormData>(internalNoteAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="makerId" value={makerId} />
      <label htmlFor="internal-note" className="label">
        Internal note <span className="normal-case tracking-normal">(only admins see this)</span>
      </label>
      <textarea
        id="internal-note"
        name="note"
        rows={4}
        defaultValue={note}
        maxLength={4000}
        className="input min-h-[100px] py-3"
        data-testid="internal-note"
      />
      <Alert state={state} />
      <SubmitButton size="sm" pendingLabel="Saving…">
        Save note
      </SubmitButton>
    </form>
  );
}

export function SpotCheckForm({ productId }: { productId: string }) {
  const [state, action] = useFormState<FormState, FormData>(spotCheckAction, undefined);
  const [down, setDown] = useState(false);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="productId" value={productId} />
      {down && (
        <textarea
          name="note"
          required
          rows={2}
          maxLength={1000}
          aria-label="Note to the maker"
          placeholder="Why it’s coming down, and what to change"
          className="input min-h-[64px] py-2 text-[13px]"
        />
      )}
      <Alert state={state} />
      <div className="flex gap-2">
        {down ? (
          <>
            <SubmitButton size="sm" name="decision" value="unpublish" pendingLabel="Unpublishing…">
              Unpublish
            </SubmitButton>
            <button
              type="button"
              onClick={() => setDown(false)}
              className="min-h-[36px] px-2 text-[12px] underline"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <SubmitButton size="sm" name="decision" value="ok" pendingLabel="Saving…">
              Looks good
            </SubmitButton>
            <button
              type="button"
              onClick={() => setDown(true)}
              className="min-h-[36px] px-2 text-[12px] underline"
            >
              Unpublish…
            </button>
          </>
        )}
      </div>
    </form>
  );
}
