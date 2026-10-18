'use client';

import { useFormState } from 'react-dom';
import { saveMeasurementsAction } from '@/lib/actions/account';
import type { FormState } from '@/lib/validation';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Field, FormAlert, Input, TextArea } from '@/components/ui/Field';

type Values = {
  heightCm: string | null;
  bustCm: string | null;
  waistCm: string | null;
  hipsCm: string | null;
  fitNotes: string | null;
} | null;

export function MeasurementsForm({ initial }: { initial: Values }) {
  const [state, action] = useFormState<FormState, FormData>(saveMeasurementsAction, undefined);
  const num = (name: 'heightCm' | 'bustCm' | 'waistCm' | 'hipsCm', label: string) => (
    <Field label={label} name={name} error={state?.errors?.[name]}>
      <Input
        name={name}
        type="number"
        inputMode="decimal"
        step="0.5"
        min={40}
        max={230}
        defaultValue={initial?.[name] ?? ''}
      />
    </Field>
  );
  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {num('heightCm', 'Height (cm)')}
        {num('bustCm', 'Bust (cm)')}
        {num('waistCm', 'Waist (cm)')}
        {num('hipsCm', 'Hips (cm)')}
      </div>
      <Field label="Preferred fit notes" name="fitNotes" error={state?.errors?.fitNotes}>
        <TextArea
          name="fitNotes"
          maxLength={1000}
          defaultValue={initial?.fitNotes ?? ''}
          placeholder="e.g. I prefer a relaxed waist and longer hem"
        />
      </Field>
      <FormAlert message={state?.message} tone={state?.ok ? 'success' : 'error'} />
      <SubmitButton>Save measurements</SubmitButton>
    </form>
  );
}
