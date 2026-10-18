'use client';

import { useFormState } from 'react-dom';
import { sellerInterestAction } from '@/lib/actions/interest';
import type { FormState } from '@/lib/validation';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { FormAlert } from '@/components/ui/Field';

export function SellerInterestForm() {
  const [state, action] = useFormState<FormState, FormData>(sellerInterestAction, undefined);
  if (state?.ok) return <FormAlert tone="success" message={state.message} />;
  const e = state?.errors ?? {};
  const field = (
    name: string,
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <div>
      <label htmlFor={`si-${name}`} className="label text-ink">
        {label}
      </label>
      <input id={`si-${name}`} name={name} className="input-line" {...props} />
      {e[name] && <p className="mt-1 text-[12px] text-error">{e[name]}</p>}
    </div>
  );
  return (
    <form action={action} className="space-y-6">
      <div className="grid gap-6 sm:grid-cols-2">
        {field('name', 'Your name', { autoComplete: 'name', required: true })}
        {field('email', 'Email', { type: 'email', autoComplete: 'email', required: true })}
        {field('label', 'Label name', { required: true })}
        {field('city', 'Studio location', { required: true, placeholder: 'e.g. Fitzroy, VIC' })}
      </div>
      {field('link', 'Website or Instagram (optional)')}
      <div>
        <label htmlFor="si-about" className="label text-ink">
          Tell us about your work
        </label>
        <textarea
          id="si-about"
          name="about"
          className="input min-h-[120px]"
          required
          minLength={20}
          maxLength={2000}
        />
        {e.about && <p className="mt-1 text-[12px] text-error">{e.about}</p>}
      </div>
      <FormAlert message={state?.message} />
      <SubmitButton size="lg" pendingLabel="Sending…">
        Send
      </SubmitButton>
    </form>
  );
}
