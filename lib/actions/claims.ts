'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getSessionUser, requireUser } from '@/lib/auth/session';
import { rateLimit } from '@/lib/rate-limit';
import { claimInputSchema, createClaim, resolveClaim, respondToClaim } from '@/lib/services/claims';
import type { FormState } from '@/lib/validation';
import { toFormState } from './util';

function fieldErrors(error: z.ZodError): FormState {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form');
    errors[key] ??= issue.message;
  }
  return { ok: false, errors, message: 'Please check the highlighted fields.' };
}

export async function submitClaimAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser('/account/orders');
  let photos: unknown = [];
  try {
    photos = JSON.parse(String(form.get('photos') ?? '[]'));
  } catch {
    photos = [];
  }
  const parsed = claimInputSchema.safeParse({
    orderItemId: form.get('orderItemId'),
    reason: form.get('reason') ?? undefined,
    details: String(form.get('details') ?? ''),
    photos,
  });
  if (!parsed.success) return fieldErrors(parsed.error);
  let claimId: string;
  try {
    await rateLimit('claim', user.id);
    ({ claimId } = await createClaim(user, parsed.data));
  } catch (err) {
    return toFormState(err);
  }
  revalidatePath('/account/orders');
  redirect(`/account/claims/${claimId}?sent=1`);
}

const respondSchema = z.object({
  claimId: z.string().uuid(),
  proposal: z.enum(['repair', 'replace', 'refund', 'alteration'], {
    errorMap: () => ({ message: 'Choose what you’ll do' }),
  }),
  message: z.string().trim().min(10, 'Add a short message for the buyer').max(4000),
});

export async function respondClaimAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user || user.role !== 'seller') return { ok: false, message: 'Please sign in.' };
  const parsed = respondSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return fieldErrors(parsed.error);
  try {
    await respondToClaim(user, parsed.data.claimId, parsed.data);
  } catch (err) {
    return toFormState(err);
  }
  revalidatePath(`/seller/claims/${parsed.data.claimId}`);
  revalidatePath('/seller/claims');
  return { ok: true, message: 'Reply sent. The buyer has been emailed.' };
}

const resolveSchema = z.object({
  claimId: z.string().uuid(),
  resolution: z.enum(['repair', 'replace', 'refund', 'reject'], {
    errorMap: () => ({ message: 'Choose an outcome' }),
  }),
  note: z.string().trim().max(4000).optional(),
  refund: z
    .union([z.literal(''), z.coerce.number().positive('Enter a refund amount').max(100_000)])
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : Math.round(v * 100))),
});

export async function resolveClaimAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user || (user.role !== 'seller' && user.role !== 'admin'))
    return { ok: false, message: 'Please sign in.' };
  const parsed = resolveSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return fieldErrors(parsed.error);
  try {
    await resolveClaim(user, parsed.data.claimId, {
      resolution: parsed.data.resolution,
      note: parsed.data.note,
      refundCents: parsed.data.refund,
    });
  } catch (err) {
    return toFormState(err);
  }
  revalidatePath('/seller/claims');
  revalidatePath('/admin/claims');
  revalidatePath(`/seller/claims/${parsed.data.claimId}`);
  revalidatePath(`/admin/claims/${parsed.data.claimId}`);
  return { ok: true, message: 'Claim resolved. The buyer has been emailed.' };
}
