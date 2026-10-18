'use client';

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { submitReviewAction } from '@/lib/actions/account';
import type { FormState } from '@/lib/validation';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { FormAlert } from '@/components/ui/Field';
import { StarIcon } from '@/components/ui/icons';

export function ReviewForm({
  orderItemId,
  productTitle,
}: {
  orderItemId: string;
  productTitle: string;
}) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [state, action] = useFormState<FormState, FormData>(submitReviewAction, undefined);
  if (state?.ok) return <FormAlert tone="success" message={state.message} />;
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium underline underline-offset-4"
      >
        Write a review
      </button>
    );
  return (
    <form action={action} className="mt-3 space-y-3 rounded-xl bg-stone-light/60 p-4">
      <input type="hidden" name="orderItemId" value={orderItemId} />
      <input type="hidden" name="rating" value={rating || ''} />
      <fieldset>
        <legend className="text-sm font-medium">Your rating for {productTitle}</legend>
        <div className="mt-1 flex gap-1" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} star${n > 1 ? 's' : ''}`}
              onClick={() => setRating(n)}
            >
              <StarIcon filled={n <= rating} width={24} height={24} />
            </button>
          ))}
        </div>
        {state?.errors?.rating && <p className="text-sm text-alert">{state.errors.rating}</p>}
      </fieldset>
      <label className="block text-sm">
        <span className="label">Title (optional)</span>
        <input name="title" maxLength={120} className="input" />
      </label>
      <label className="block text-sm">
        <span className="label">Review</span>
        <textarea
          name="body"
          required
          minLength={10}
          maxLength={2000}
          rows={4}
          className="input"
          placeholder="How was the fit, fabric and finish?"
        />
        {state?.errors?.body && <span className="text-sm text-alert">{state.errors.body}</span>}
      </label>
      <FormAlert message={state?.message} />
      <SubmitButton size="sm" pendingLabel="Posting…" disabled={!rating}>
        Post review
      </SubmitButton>
    </form>
  );
}
