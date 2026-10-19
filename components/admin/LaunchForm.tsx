'use client';

import { useFormState } from 'react-dom';
import { setLaunchAction } from '@/lib/actions/launch';
import type { FormState } from '@/lib/validation';
import { SubmitButton } from '@/components/ui/SubmitButton';

const MODES = [
  {
    value: 'waitlist',
    label: 'Waitlist',
    body: 'Shops and pieces can be live, but checkout is closed (“Opening soon. Join the waitlist.”). Makers see when you open.',
  },
  { value: 'open', label: 'Open', body: 'Everything is public and buyers can check out.' },
] as const;

export function LaunchForm({
  mode,
  opensOn,
  previewMode,
}: {
  mode: string;
  opensOn: string | null;
  previewMode: boolean;
}) {
  const [state, action] = useFormState<FormState, FormData>(setLaunchAction, undefined);
  return (
    <form action={action} className="max-w-xl space-y-6" data-testid="launch-form">
      <fieldset className="space-y-2">
        <legend className="label">Mode</legend>
        {MODES.map((m) => (
          <label key={m.value} className="flex items-start gap-3 border border-line p-4">
            <input
              type="radio"
              name="mode"
              value={m.value}
              defaultChecked={mode === m.value}
              className="mt-1"
              data-testid={`launch-${m.value}`}
            />
            <span>
              <span className="block text-[15px]">{m.label}</span>
              <span className="block text-[13px] text-muted">{m.body}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {previewMode && (
        <p className="bg-stone p-3 text-[13px]">
          This deployment runs with PREVIEW_MODE on, so checkout stays closed whatever the mode
          until PREVIEW_MODE is turned off in the hosting settings.
        </p>
      )}
      <div>
        <label htmlFor="opens-on" className="label">
          Opens to buyers on
        </label>
        <input
          id="opens-on"
          type="date"
          name="opensOn"
          defaultValue={opensOn ?? ''}
          className="input max-w-[220px]"
        />
      </div>
      {state?.message && (
        <p className={`text-[13px] ${state.ok ? 'text-muted' : 'text-error'}`} role="status">
          {state.message}
        </p>
      )}
      <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
    </form>
  );
}
