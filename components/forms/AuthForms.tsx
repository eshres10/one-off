'use client';

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { loginAction, magicLinkAction, signupAction } from '@/lib/actions/auth';
import { loginSchema, signupSchema, type FormState } from '@/lib/validation';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Field, FormAlert, Input } from '@/components/ui/Field';

type Mode = 'password' | 'magic' | 'signup';

export function AuthForms({ next, magicLinks = true }: { next: string; magicLinks?: boolean }) {
  const [mode, setMode] = useState<Mode>('password');
  const [loginState, login] = useFormState<FormState, FormData>(loginAction, undefined);
  const [magicState, magic] = useFormState<FormState, FormData>(magicLinkAction, undefined);
  const [signupState, signup] = useFormState<FormState, FormData>(signupAction, undefined);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});

  // Client-side validation with the same Zod schemas the server uses.
  const validate =
    (schema: typeof loginSchema | typeof signupSchema) => (e: React.FormEvent<HTMLFormElement>) => {
      const res = schema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
      if (!res.success) {
        e.preventDefault();
        setClientErrors(
          Object.fromEntries(res.error.issues.map((i) => [String(i.path[0]), i.message])),
        );
      } else setClientErrors({});
    };

  const tab = (m: Mode, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === m}
      onClick={() => {
        setMode(m);
        setClientErrors({});
      }}
      className={`flex-1 rounded-full px-3 py-2 text-sm ${mode === m ? 'bg-ink text-paper' : 'text-ink-soft hover:text-ink'}`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div
        role="tablist"
        aria-label="Sign in options"
        className="flex gap-1 rounded-full border border-stone bg-white p-1"
      >
        {tab('password', 'Sign in')}
        {magicLinks && tab('magic', 'Email me a link')}
        {tab('signup', 'Create account')}
      </div>

      {mode === 'password' && (
        <form action={login} onSubmit={validate(loginSchema)} className="mt-6 space-y-4" noValidate>
          <input type="hidden" name="next" value={next} />
          <Field label="Email" name="email" error={clientErrors.email ?? loginState?.errors?.email}>
            <Input name="email" type="email" autoComplete="email" required />
          </Field>
          <Field
            label="Password"
            name="password"
            error={clientErrors.password ?? loginState?.errors?.password}
          >
            <Input name="password" type="password" autoComplete="current-password" required />
          </Field>
          <FormAlert message={loginState?.message} />
          <SubmitButton className="w-full" pendingLabel="Signing in…">
            Sign in
          </SubmitButton>
        </form>
      )}

      {mode === 'magic' && (
        <form action={magic} className="mt-6 space-y-4">
          <input type="hidden" name="next" value={next} />
          <Field
            label="Email"
            name="email"
            error={magicState?.errors?.email}
            hint="We’ll email you a one-time sign-in link."
          >
            <Input name="email" type="email" autoComplete="email" required />
          </Field>
          <FormAlert message={magicState?.message} tone={magicState?.ok ? 'success' : 'error'} />
          <SubmitButton className="w-full" pendingLabel="Sending…">
            Email me a sign-in link
          </SubmitButton>
        </form>
      )}

      {mode === 'signup' && (
        <form
          action={signup}
          onSubmit={validate(signupSchema)}
          className="mt-6 space-y-4"
          noValidate
        >
          <input type="hidden" name="next" value={next} />
          <Field label="Name" name="name" error={clientErrors.name ?? signupState?.errors?.name}>
            <Input name="name" autoComplete="name" required />
          </Field>
          <Field
            label="Email"
            name="email"
            error={clientErrors.email ?? signupState?.errors?.email}
          >
            <Input name="email" type="email" autoComplete="email" required />
          </Field>
          <Field
            label="Password"
            name="password"
            error={clientErrors.password ?? signupState?.errors?.password}
            hint="At least 8 characters."
          >
            <Input name="password" type="password" autoComplete="new-password" required />
          </Field>
          <FormAlert message={signupState?.message} tone={signupState?.ok ? 'success' : 'error'} />
          <SubmitButton className="w-full" pendingLabel="Creating account…">
            Create account
          </SubmitButton>
          <p className="text-xs text-ink-muted">
            Selling on the platform is by invitation. Seller accounts are set up by our team.
          </p>
        </form>
      )}
    </div>
  );
}
