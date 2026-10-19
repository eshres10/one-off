'use server';

import { revalidatePath } from 'next/cache';
import { getSessionUser, requireAdmin, requireUser } from '@/lib/auth/session';
import { rateLimit } from '@/lib/rate-limit';
import { createSupportRequest, supportRequestSchema } from '@/lib/services/support-requests';
import { adminReply, sendSupportMessage } from '@/lib/services/support';
import type { FormState } from '@/lib/validation';
import { clientIp, toFormState } from './util';

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

/** Help & FAQ "Message us": anyone can send one, signed in or not. */
export async function supportRequestAction(input: {
  name: string;
  email: string;
  topic: string;
  orderNumber?: string;
  message: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const parsed = supportRequestSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  try {
    const user = await getSessionUser();
    await rateLimit('supportRequest', user?.id ?? clientIp());
    await createSupportRequest(parsed.data, user?.id ?? null);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: toFormState(err)?.message ?? 'Please try again.' };
  }
}
