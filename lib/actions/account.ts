'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth/session';
import { withUser } from '@/lib/db';
import { sanitizeText } from '@/lib/domain/moderation';
import { isOwnImageUrl } from '@/lib/storage';
import { createCommissionRequest, decideQuote } from '@/lib/services/commissions';
import { submitReview } from '@/lib/services/reviews';
import {
  commissionRequestSchema,
  fieldErrors,
  measurementsSchema,
  reviewSchema,
  type FormState,
} from '@/lib/validation';
import { toFormState } from './util';

export async function submitReviewAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: 'Please sign in again.' };
  const parsed = reviewSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  try {
    await submitReview(user, parsed.data);
  } catch (err) {
    return toFormState(err);
  }
  revalidatePath('/account/orders');
  return { ok: true, message: 'Thank you — your review is live.' };
}

export async function saveMeasurementsAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: 'Please sign in again.' };
  const parsed = measurementsSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const m = parsed.data;
  try {
    await withUser(
      user,
      (db) => db`
      insert into public.buyer_measurements (user_id, height_cm, bust_cm, waist_cm, hips_cm, fit_notes)
      values (${user.id}, ${m.heightCm ?? null}, ${m.bustCm ?? null}, ${m.waistCm ?? null}, ${m.hipsCm ?? null},
        ${m.fitNotes ? sanitizeText(m.fitNotes) : null})
      on conflict (user_id) do update set height_cm = excluded.height_cm, bust_cm = excluded.bust_cm, waist_cm = excluded.waist_cm,
        hips_cm = excluded.hips_cm, fit_notes = excluded.fit_notes`,
    );
  } catch (err) {
    return toFormState(err);
  }
  return { ok: true, message: 'Measurements saved.' };
}

export async function createCommissionAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: 'Please sign in to request a custom piece.' };
  const parsed = commissionRequestSchema.safeParse({
    ...Object.fromEntries(form),
    inspirationImageUrls: form
      .getAll('inspirationImageUrls')
      .map(String)
      .filter((u) => u && isOwnImageUrl(u)),
  });
  if (!parsed.success)
    return {
      ok: false,
      errors: fieldErrors(parsed.error),
      message: 'Please check the highlighted fields.',
    };
  let id: string;
  try {
    id = await createCommissionRequest(user, parsed.data);
  } catch (err) {
    return toFormState(err);
  }
  redirect(`/account/commissions/${id}?submitted=1`);
}

export async function decideQuoteAction(form: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const input = z
    .object({ requestId: z.string().uuid(), decision: z.enum(['accepted', 'declined']) })
    .parse(Object.fromEntries(form));
  await decideQuote(user, input.requestId, input.decision);
  revalidatePath(`/account/commissions/${input.requestId}`);
}
