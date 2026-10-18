'use client';

import { useFormState } from 'react-dom';
import { saveProfileAction } from '@/lib/actions/seller';
import type { FormState } from '@/lib/validation';
import type { SellerMaker } from '@/lib/queries/seller';
import { ImageUploader } from '@/components/forms/ImageUploader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Field, FormAlert, Input, Select, TextArea } from '@/components/ui/Field';

export function ProfileForm({ maker }: { maker: SellerMaker }) {
  const [state, action] = useFormState<FormState, FormData>(saveProfileAction, undefined);
  const e = state?.errors ?? {};
  return (
    <form action={action} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Label name" name="displayName" error={e.displayName}>
          <Input name="displayName" defaultValue={maker.displayName} required />
        </Field>
        <Field label="Tagline" name="tagline" error={e.tagline}>
          <Input name="tagline" defaultValue={maker.tagline ?? ''} maxLength={160} />
        </Field>
        <Field label="City / suburb" name="city" error={e.city}>
          <Input name="city" defaultValue={maker.city ?? ''} required />
        </Field>
        <Field label="State" name="state" error={e.state}>
          <Select name="state" defaultValue={maker.state ?? 'VIC'}>
            {['VIC', 'NSW', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="label">Avatar</p>
          <ImageUploader name="avatarUrl" kind="makers" max={1} label="Upload avatar" />
        </div>
        <div>
          <p className="label">Cover image</p>
          <ImageUploader name="coverUrl" kind="makers" max={1} label="Upload cover" />
        </div>
      </div>
      <Field label="Your story" name="story" error={e.story}>
        <TextArea name="story" defaultValue={maker.story ?? ''} rows={4} />
      </Field>
      <Field label="Process" name="process" error={e.process}>
        <TextArea name="process" defaultValue={maker.process ?? ''} rows={3} />
      </Field>
      <Field label="Materials" name="materials" error={e.materials}>
        <TextArea name="materials" defaultValue={maker.materials ?? ''} rows={3} />
      </Field>
      <Field label="Sizing approach" name="sizingNotes" error={e.sizingNotes}>
        <TextArea name="sizingNotes" defaultValue={maker.sizingNotes ?? ''} rows={3} />
      </Field>
      <h2 className="font-sans text-[11px] font-normal uppercase tracking-label">
        Production & shipping
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Made-to-order lead time (days)" name="leadTimeDays" error={e.leadTimeDays}>
          <Input
            name="leadTimeDays"
            type="number"
            min={0}
            max={120}
            defaultValue={maker.leadTimeDays}
          />
        </Field>
        <Field
          label="Dispatch time for ready-to-ship (business days)"
          name="dispatchDays"
          error={e.dispatchDays}
        >
          <Input
            name="dispatchDays"
            type="number"
            min={0}
            max={30}
            defaultValue={maker.dispatchDays}
          />
        </Field>
        <Field
          label="Flat shipping per order (A$)"
          name="shippingStandard"
          error={e.shippingStandard}
        >
          <Input
            name="shippingStandard"
            type="number"
            min={0}
            step="0.01"
            defaultValue={maker.shippingStandardCents / 100}
          />
        </Field>
        <Field
          label="Free shipping over (A$, optional)"
          name="freeShippingOver"
          error={e.freeShippingOver}
        >
          <Input
            name="freeShippingOver"
            type="number"
            min={0}
            step="1"
            defaultValue={maker.freeShippingOverCents ? maker.freeShippingOverCents / 100 : ''}
          />
        </Field>
      </div>
      <Field label="Return policy" name="returnPolicy" error={e.returnPolicy}>
        <TextArea name="returnPolicy" defaultValue={maker.returnPolicy} rows={3} required />
      </Field>
      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          name="customCommissionsEnabled"
          defaultChecked={maker.customCommissionsEnabled}
          className="h-4 w-4 accent-ink"
        />
        Accept custom commission requests (concierge pilot)
      </label>
      <FormAlert message={state?.message} tone={state?.ok ? 'success' : 'error'} />
      <SubmitButton>Save profile</SubmitButton>
    </form>
  );
}
