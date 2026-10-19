'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin, requireUser } from '@/lib/auth/session';
import { adminReply, sendSupportMessage } from '@/lib/services/support';
import type { FormState } from '@/lib/validation';
import { toFormState } from './util';

export async function sendSupportAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser('/studio/support');
  try {
    const topic = String(form.get('topic') ?? '').slice(0, 80) || null;
    await sendSupportMessage(user, String(form.get('body') ?? ''), topic);
  } catch (err) {
    return toFormState(err);
  }
  revalidatePath('/studio/support');
  return { ok: true, message: 'Sent. We usually reply within a day.' };
}

export async function adminReplyAction(_prev: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const userId = String(form.get('userId') ?? '');
  try {
    await adminReply(admin.id, userId, String(form.get('body') ?? ''));
  } catch (err) {
    return toFormState(err);
  }
  revalidatePath(`/admin/support/${userId}`);
  return { ok: true, message: 'Reply sent.' };
}
