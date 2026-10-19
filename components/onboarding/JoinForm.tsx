'use client';

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { magicLinkAction } from '@/lib/actions/auth';
import type { FormState } from '@/lib/validation';
import { AuthForms } from '@/components/forms/AuthForms';
import { SubmitButton } from '@/components/ui/SubmitButton';

/** Email sign-up on /join: a magic link by default, or a password if they'd rather. */
export function JoinForm({ magicLinks }: { magicLinks: boolean }) {
  const [state, action] = useFormState<FormState, FormData>(magicLinkAction, undefined);
  const [password, setPassword] = useState(!magicLinks);
  if (password)
    return (
      <div data-testid="join-password">
        <AuthForms next="/welcome" magicLinks={magicLinks} initialMode="signup" />
      </div>
    );
  return (
    <form action={action} className="space-y-3" data-testid="join-email">
      <input type="hidden" name="next" value="/welcome" />
      <label htmlFor="join-email" className="sr-only">
        Email
      </label>
      <input
        id="join-email"
        name="email"
        type="email"
        autoComplete="email"
        required
        placeholder="you@example.com"
        className="input"
      />
      {state?.message && (
        <p className={`text-[13px] ${state.ok ? 'text-ink' : 'text-error'}`} role="status">
          {state.message}
        </p>
      )}
      <SubmitButton className="w-full" pendingLabel="Sending…">
        Continue with email
      </SubmitButton>
      <button
        type="button"
        onClick={() => setPassword(true)}
        className="min-h-[44px] w-full text-[12px] text-muted underline underline-offset-4"
        data-testid="join-use-password"
      >
        Prefer a password? Create an account
      </button>
    </form>
  );
}
