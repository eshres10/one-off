'use client';

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { saveLabelAction } from '@/lib/actions/sell';
import type { FormState } from '@/lib/validation';
import { CheckIcon } from '@/components/ui/icons';
import { SubmitButton } from '@/components/ui/SubmitButton';

export function LabelForm({
  initial,
  makes,
  modes,
}: {
  initial: { name: string; suburb: string; instagram: string; makes: string[]; modes: string[] };
  makes: readonly string[];
  modes: ReadonlyArray<{ value: string; label: string; body: string }>;
}) {
  const [state, action] = useFormState<FormState, FormData>(saveLabelAction, undefined);
  const [picked, setPicked] = useState<string[]>(initial.makes);
  const [how, setHow] = useState<string[]>(initial.modes);
  const toggle = (list: string[], v: string) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  return (
    <form action={action} className="space-y-6" data-testid="label-form">
      <div>
        <label htmlFor="label-name" className="label">
          Label name
        </label>
        <input
          id="label-name"
          name="name"
          required
          maxLength={60}
          defaultValue={initial.name}
          className="input"
          autoComplete="organization"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="label-suburb" className="label">
            Suburb
          </label>
          <input
            id="label-suburb"
            name="suburb"
            required
            maxLength={60}
            defaultValue={initial.suburb}
            className="input"
          />
        </div>
        <div>
          <label htmlFor="label-instagram" className="label">
            Instagram
          </label>
          <input
            id="label-instagram"
            name="instagram"
            maxLength={31}
            defaultValue={initial.instagram}
            placeholder="@yourlabel"
            className="input"
          />
        </div>
      </div>
      <fieldset>
        <legend className="label">What do you make?</legend>
        <div className="flex flex-wrap gap-2">
          {makes.map((m) => {
            const on = picked.includes(m);
            return (
              <label
                key={m}
                className={`flex min-h-[44px] cursor-pointer items-center rounded-circle border px-4 text-[13px] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink ${on ? 'border-ink bg-ink text-ground' : 'border-line-strong'}`}
              >
                <input
                  type="checkbox"
                  name="makes"
                  value={m}
                  checked={on}
                  onChange={() => setPicked((p) => toggle(p, m))}
                  className="sr-only"
                />
                {m}
              </label>
            );
          })}
        </div>
      </fieldset>
      <fieldset>
        <legend className="label">How do you sell?</legend>
        <div className="space-y-2">
          {modes.map((m) => {
            const on = how.includes(m.value);
            return (
              <label
                key={m.value}
                className={`flex min-h-[64px] cursor-pointer items-center gap-3 border p-4 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink ${on ? 'border-ink' : 'border-line-strong'}`}
                data-testid={`mode-${m.value}`}
              >
                <input
                  type="checkbox"
                  name="modes"
                  value={m.value}
                  checked={on}
                  onChange={() => setHow((h) => toggle(h, m.value))}
                  className="sr-only"
                />
                <span
                  aria-hidden
                  className={`flex h-5 w-5 shrink-0 items-center justify-center border ${on ? 'border-ink bg-ink text-ground' : 'border-line-strong'}`}
                >
                  {on && <CheckIcon width={12} height={12} />}
                </span>
                <span>
                  <span className="block text-[14px]">{m.label}</span>
                  <span className="block text-[12px] text-muted">{m.body}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      {state?.message && (
        <p className="text-[13px] text-error" role="alert">
          {state.message}
        </p>
      )}
      <SubmitButton
        className="w-full"
        pendingLabel="Saving…"
        disabled={!picked.length || !how.length}
        data-testid="label-continue"
      >
        Continue
      </SubmitButton>
    </form>
  );
}
