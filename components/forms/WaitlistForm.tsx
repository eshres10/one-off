'use client';

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { joinWaitlistAction } from '@/lib/actions/waitlist';
import type { FormState } from '@/lib/validation';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { FormAlert } from '@/components/ui/Field';

const KINDS = [
  { value: 'shopper', label: 'I want to shop' },
  { value: 'maker', label: 'I’m a maker' },
] as const;

export function WaitlistForm({ source }: { source?: string }) {
  const [state, action] = useFormState<FormState, FormData>(joinWaitlistAction, undefined);
  const [kind, setKind] = useState<(typeof KINDS)[number]['value']>('shopper');
  if (state?.ok)
    return (
      <div data-testid="waitlist-success">
        <FormAlert tone="success" message={state.message} />
      </div>
    );
  const e = state?.errors ?? {};
  const error = (name: string) =>
    e[name] && (
      <p id={`wl-${name}-error`} className="mt-1 text-[12px] text-error" role="alert">
        {e[name]}
      </p>
    );
  return (
    <form action={action} className="space-y-6" noValidate>
      {source && <input type="hidden" name="source" value={source} />}
      <fieldset>
        <legend className="label">I’m joining as</legend>
        <div className="grid grid-cols-2 gap-px bg-line-strong p-px">
          {KINDS.map((k) => (
            <label
              key={k.value}
              className={`flex min-h-[48px] cursor-pointer items-center justify-center px-3 text-center text-[11px] uppercase tracking-[0.18em] transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink ${
                kind === k.value ? 'bg-ink text-ground' : 'bg-surface text-ink hover:bg-ground'
              }`}
            >
              <input
                type="radio"
                name="kind"
                value={k.value}
                checked={kind === k.value}
                onChange={() => setKind(k.value)}
                className="sr-only"
              />
              {k.label}
            </label>
          ))}
        </div>
        {error('kind')}
      </fieldset>

      <div>
        <label htmlFor="wl-email" className="label text-ink">
          Email
        </label>
        <input
          id="wl-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="input-line"
          aria-invalid={e.email ? true : undefined}
          aria-describedby={e.email ? 'wl-email-error' : undefined}
        />
        {error('email')}
      </div>

      {kind === 'maker' && (
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <label htmlFor="wl-name" className="label text-ink">
              Label name
            </label>
            <input
              id="wl-name"
              name="name"
              autoComplete="organization"
              required
              maxLength={80}
              className="input-line"
              aria-invalid={e.name ? true : undefined}
              aria-describedby={e.name ? 'wl-name-error' : undefined}
            />
            {error('name')}
          </div>
          <div>
            <label htmlFor="wl-instagram" className="label text-ink">
              Instagram (optional)
            </label>
            <input
              id="wl-instagram"
              name="instagram"
              placeholder="@yourlabel"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="input-line"
              aria-invalid={e.instagram ? true : undefined}
              aria-describedby={e.instagram ? 'wl-instagram-error' : undefined}
            />
            {error('instagram')}
          </div>
        </div>
      )}

      <FormAlert message={state?.message} />
      <SubmitButton size="lg" pendingLabel="Joining…" className="w-full">
        {kind === 'maker' ? 'Apply for early access' : 'Join the waitlist'}
      </SubmitButton>
      <p className="text-[12px] text-muted-2">No spam. Just a note when we open.</p>
    </form>
  );
}
