'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getSessionUser, requireUser } from '@/lib/auth/session';
import { rateLimit } from '@/lib/rate-limit';
import {
  addCaseNote,
  claimInputSchema,
  createClaim,
  resolveClaim,
  respondToClaim,
} from '@/lib/services/claims';
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

export type ReportResult =
  | { ok: true; caseNumber: string; claimId: string }
  | { ok: false; message?: string; errors?: Record<string, string> };

/** Report a problem: the four-step flow sends everything at once from step 3. */
export async function reportProblemAction(input: {
  orderItemId: string;
  reason: string;
  details: string;
  photos: string[];
  outcome: string;
}): Promise<ReportResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: 'Please sign in again.' };
  const parsed = claimInputSchema.safeParse(input);
  if (!parsed.success) {
    const f = fieldErrors(parsed.error);
    return { ok: false, message: f?.message, errors: f?.errors };
  }
  try {
    await rateLimit('claim', user.id);
    const { claimId, caseNumber } = await createClaim(user, parsed.data);
    revalidatePath('/account/orders', 'layout');
    return { ok: true, claimId, caseNumber };
  } catch (err) {
    const f = toFormState(err);
    return { ok: false, message: f?.message ?? 'Something went wrong. Please try again.' };
  }
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
  revalidatePath(`/studio/claims/${parsed.data.claimId}`);
  revalidatePath('/studio/claims');
  return { ok: true, message: 'Reply sent. The buyer has been emailed.' };
}

const resolveSchema = z.object({
  claimId: z.string().uuid(),
  resolution: z.enum(['repair', 'replace', 'refund', 'reject'], {
    errorMap: () => ({ message: 'Choose an outcome' }),
  }),
  note: z.string().trim().max(4000).optional(),
  internalNote: z.string().trim().max(2000).optional(),
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
      internalNote: parsed.data.internalNote || undefined,
    });
  } catch (err) {
    return toFormState(err);
  }
  revalidatePath('/studio/claims');
  revalidatePath('/admin/claims');
  revalidatePath(`/studio/claims/${parsed.data.claimId}`);
  revalidatePath(`/admin/claims/${parsed.data.claimId}`);
  return { ok: true, message: 'Claim resolved. The buyer has been emailed.' };
}

/** Admin: an internal note on a case, without resolving it. */
export async function addCaseNoteAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') return { ok: false, message: 'Please sign in.' };
  const claimId = z.string().uuid().safeParse(form.get('claimId'));
  if (!claimId.success) return { ok: false, message: 'Case not found.' };
  try {
    await addCaseNote(user, claimId.data, String(form.get('body') ?? ''));
  } catch (err) {
    return toFormState(err);
  }
  revalidatePath(`/admin/claims/${claimId.data}`);
  return { ok: true, message: 'Note added.' };
}
