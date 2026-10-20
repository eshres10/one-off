'use client';

import { useFormState } from 'react-dom';
import { listingRequestAction } from '@/lib/actions/studio-listings';
import { ImageUploader } from '@/components/forms/ImageUploader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { FormAlert } from '@/components/ui/Field';
import type { FormState } from '@/lib/validation';

/** Photos plus a note; Off One lists the piece. */
export function SendPhotosForm() {
  const [state, action] = useFormState<FormState, FormData>(listingRequestAction, undefined);
  if (state?.ok)
    return (
      <p className="bg-stone px-4 py-4 text-[14px]" role="status" data-testid="send-photos-done">
        {state.message}
      </p>
    );
  return (
    <form action={action} className="space-y-6" data-testid="send-photos-form">
      <ImageUploader name="photoUrls" kind="products" max={12} label="Add photos" />
      <label className="block">
        <span className="text-[11px] uppercase tracking-label">About the piece</span>
        <textarea
          name="note"
          rows={5}
          maxLength={2000}
          placeholder="Name, price, sizes and stock, fabric, and anything a buyer should know."
          className="mt-2 min-h-[140px] w-full border border-line-strong bg-surface p-3 text-[15px]"
        />
      </label>
      <FormAlert message={state?.message} tone="error" />
      <SubmitButton>Send to Off One</SubmitButton>
    </form>
  );
}
