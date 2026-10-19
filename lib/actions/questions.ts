'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth/session';
import { askQuestion, replyToQuestion } from '@/lib/services/questions';
import type { FormState } from '@/lib/validation';
import { toFormState } from './util';

const uuid = z.string().uuid();

/** A public question on a piece (quick view and product page). */
export async function askQuestionAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: 'Sign in to ask a question.' };
  const productId = uuid.safeParse(form.get('productId'));
  if (!productId.success) return { ok: false, message: 'That piece isn’t available.' };
  try {
    await askQuestion(user, productId.data, String(form.get('body') ?? ''));
  } catch (err) {
    return toFormState(err);
  }
  revalidatePath(`/products/${String(form.get('slug') ?? '')}`);
  return { ok: true, message: 'Question posted. The maker has been notified.' };
}

export async function replyQuestionAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: 'Sign in to reply.' };
  const questionId = uuid.safeParse(form.get('questionId'));
  if (!questionId.success) return { ok: false, message: 'That question no longer exists.' };
  try {
    await replyToQuestion(user, questionId.data, String(form.get('body') ?? ''));
  } catch (err) {
    return toFormState(err);
  }
  revalidatePath(`/products/${String(form.get('slug') ?? '')}`);
  return { ok: true, message: 'Reply posted.' };
}
