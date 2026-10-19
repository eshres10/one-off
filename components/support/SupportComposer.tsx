'use client';

import { useEffect, useRef } from 'react';
import { useFormState } from 'react-dom';
import type { FormState } from '@/lib/validation';
import { SubmitButton } from '@/components/ui/SubmitButton';

/** The reply box for a maker ↔ One Off conversation (either side). */
export function SupportComposer({
  action,
  hidden = {},
  placeholder,
  defaultValue,
  label = 'Send',
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  hidden?: Record<string, string>;
  placeholder: string;
  defaultValue?: string;
  label?: string;
}) {
  const [state, run] = useFormState<FormState, FormData>(action, undefined);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={run} className="space-y-3" data-testid="support-form">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label htmlFor="support-body" className="sr-only">
        Message
      </label>
      <textarea
        id="support-body"
        name="body"
        required
        maxLength={4000}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="input min-h-[120px]"
      />
      {state?.message && (
        <p className={`text-[13px] ${state.ok ? 'text-ink' : 'text-error'}`} role="status">
          {state.message}
        </p>
      )}
      <SubmitButton pendingLabel="Sending…">{label}</SubmitButton>
    </form>
  );
}
