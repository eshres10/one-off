'use client';

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { createCommissionAction } from '@/lib/actions/account';
import { commissionRequestSchema, type FormState } from '@/lib/validation';
import { ImageUploader } from './ImageUploader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Field, FormAlert, Input, TextArea } from '@/components/ui/Field';

export function CommissionForm({
  makerId,
  sourceProductId,
  defaultMeasurements,
}: {
  makerId?: string;
  sourceProductId?: string;
  defaultMeasurements?: string;
}) {
  const [state, action] = useFormState<FormState, FormData>(createCommissionAction, undefined);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const err = (k: string) => clientErrors[k] ?? state?.errors?.[k];

  return (
    <form
      action={action}
      noValidate
      onSubmit={(e) => {
        const data = Object.fromEntries(new FormData(e.currentTarget));
        const res = commissionRequestSchema.safeParse({ ...data, inspirationImageUrls: [] });
        if (!res.success) {
          e.preventDefault();
          setClientErrors(
            Object.fromEntries(res.error.issues.map((i) => [i.path.join('.'), i.message])),
          );
        } else setClientErrors({});
      }}
      className="space-y-5"
    >
      {makerId && <input type="hidden" name="makerId" value={makerId} />}
      {sourceProductId && <input type="hidden" name="sourceProductId" value={sourceProductId} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Garment type" name="garmentType" error={err('garmentType')}>
          <Input
            name="garmentType"
            placeholder="e.g. Midi dress, wrap skirt"
            required
            maxLength={80}
          />
        </Field>
        <Field label="Occasion" name="occasion" error={err('occasion')}>
          <Input
            name="occasion"
            placeholder="e.g. Spring wedding, garden ceremony"
            maxLength={160}
          />
        </Field>
        <Field label="Budget from (A$)" name="budgetMin" error={err('budgetMin')}>
          <Input
            name="budgetMin"
            type="number"
            inputMode="numeric"
            min={50}
            step={10}
            placeholder="250"
            required
          />
        </Field>
        <Field label="Budget up to (A$)" name="budgetMax" error={err('budgetMax')}>
          <Input
            name="budgetMax"
            type="number"
            inputMode="numeric"
            min={50}
            step={10}
            placeholder="450"
            required
          />
        </Field>
        <Field label="Needed by (optional)" name="deadline" error={err('deadline')}>
          <Input
            name="deadline"
            type="date"
            min={new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}
          />
        </Field>
      </div>
      <Field label="Measurements or fit notes" name="measurements" error={err('measurements')}>
        <TextArea
          name="measurements"
          maxLength={1000}
          defaultValue={defaultMeasurements}
          placeholder="Bust, waist, hips, height — and how you like things to fit"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Fabric preferences" name="fabricPreferences" error={err('fabricPreferences')}>
          <TextArea
            name="fabricPreferences"
            maxLength={500}
            rows={2}
            placeholder="e.g. Linen or silk, nothing synthetic"
          />
        </Field>
        <Field label="Colour preferences" name="colourPreferences" error={err('colourPreferences')}>
          <TextArea
            name="colourPreferences"
            maxLength={500}
            rows={2}
            placeholder="e.g. Deep green, rust"
          />
        </Field>
      </div>
      <div>
        <p className="label">Inspiration images</p>
        <ImageUploader
          name="inspirationImageUrls"
          kind="commissions"
          max={6}
          label="Add inspiration"
        />
      </div>
      <Field label="Anything else?" name="notes" error={err('notes')}>
        <TextArea
          name="notes"
          maxLength={2000}
          placeholder="Pockets, sleeves, lining, sustainability preferences…"
        />
      </Field>
      <FormAlert message={state?.message} />
      <SubmitButton pendingLabel="Sending request…">Send request</SubmitButton>
    </form>
  );
}
