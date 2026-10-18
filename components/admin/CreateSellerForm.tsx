'use client';

import { useFormState } from 'react-dom';
import { createSellerAction } from '@/lib/actions/admin';
import type { FormState } from '@/lib/validation';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Field, FormAlert, Input, Select } from '@/components/ui/Field';

export function CreateSellerForm() {
  const [state, action] = useFormState<FormState, FormData>(createSellerAction, undefined);
  const e = state?.errors ?? {};
  return (
    <form action={action} className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
      <Field label="Email" name="email" error={e.email}>
        <Input name="email" type="email" required />
      </Field>
      <Field label="Label name" name="displayName" error={e.displayName}>
        <Input name="displayName" required />
      </Field>
      <Field label="Shop URL slug" name="slug" error={e.slug}>
        <Input name="slug" required pattern="[a-z0-9-]{3,60}" placeholder="e.g. hobart-hem" />
      </Field>
      <Field label="City" name="city" error={e.city}>
        <Input name="city" required />
      </Field>
      <Field label="State" name="state" error={e.state}>
        <Select name="state" defaultValue="VIC">
          {['VIC', 'NSW', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
      </Field>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-5">
        <SubmitButton size="sm" pendingLabel="Creating…">
          Create seller & send invite
        </SubmitButton>
        <FormAlert message={state?.message} tone={state?.ok ? 'success' : 'error'} />
      </div>
    </form>
  );
}
