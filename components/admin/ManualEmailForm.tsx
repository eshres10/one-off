'use client';

import { useFormState } from 'react-dom';
import { manualEmailAction } from '@/lib/actions/admin';
import type { FormState } from '@/lib/validation';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { FormAlert } from '@/components/ui/Field';

export function ManualEmailForm() {
  const [state, action] = useFormState<FormState, FormData>(manualEmailAction, undefined);
  return (
    <form action={action} className="card space-y-2 p-4">
      <p className="text-sm font-medium">Send an email</p>
      <input
        name="to"
        type="email"
        required
        placeholder="To"
        aria-label="To"
        className="input py-2 text-sm"
      />
      <input
        name="subject"
        required
        placeholder="Subject"
        aria-label="Subject"
        className="input py-2 text-sm"
      />
      <textarea
        name="body"
        required
        rows={5}
        placeholder="Message"
        aria-label="Message"
        className="input text-sm"
      />
      <FormAlert
        message={
          state?.message ?? (state?.errors ? Object.values(state.errors).join(' ') : undefined)
        }
        tone={state?.ok ? 'success' : 'error'}
      />
      <SubmitButton size="sm" pendingLabel="Sending…">
        Send
      </SubmitButton>
    </form>
  );
}
