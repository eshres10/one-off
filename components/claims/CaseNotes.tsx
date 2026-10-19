'use client';

import { useFormState } from 'react-dom';
import { addCaseNoteAction } from '@/lib/actions/claims';
import type { FormState } from '@/lib/validation';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { FormAlert } from '@/components/ui/Field';

/** Admin-only notes on a case. */
export function CaseNotes({
  claimId,
  notes,
}: {
  claimId: string;
  notes: Array<{ id: string; body: string; createdAt: Date; author: string | null }>;
}) {
  const [state, action] = useFormState<FormState, FormData>(addCaseNoteAction, undefined);
  return (
    <section className="border border-line bg-surface p-5" aria-labelledby="case-notes">
      <h2 id="case-notes" className="text-[24px] leading-none">
        Internal notes
      </h2>
      <p className="mt-1 text-[12px] text-muted-2">Only One Off sees these.</p>
      {notes.length > 0 && (
        <ul className="mt-4 space-y-3" data-testid="case-notes-list">
          {notes.map((n) => (
            <li key={n.id} className="border-l-2 border-line pl-3 text-[14px]">
              <p className="whitespace-pre-line">{n.body}</p>
              <p className="text-[11px] text-muted-2">
                {n.author ?? 'Admin'} ·{' '}
                {new Date(n.createdAt).toLocaleString('en-AU', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                  timeZone: 'Australia/Melbourne',
                })}
              </p>
            </li>
          ))}
        </ul>
      )}
      <form action={action} className="mt-4 space-y-3">
        <input type="hidden" name="claimId" value={claimId} />
        <textarea
          name="body"
          rows={2}
          maxLength={2000}
          required
          aria-label="New internal note"
          className="input min-h-[64px]"
        />
        <FormAlert message={state?.message} tone={state?.ok ? 'success' : 'error'} />
        <SubmitButton size="md" variant="secondary">
          Add note
        </SubmitButton>
      </form>
    </section>
  );
}
