'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth/session';
import { isOwnImageUrl } from '@/lib/storage';
import { sendMessage, startMakerThread, startProductThread } from '@/lib/services/messaging';
import { fieldErrors, messageSchema, startThreadSchema, type FormState } from '@/lib/validation';
import { toFormState } from './util';

function images(form: FormData) {
  return form
    .getAll('imageUrls')
    .map(String)
    .filter((u) => u && isOwnImageUrl(u));
}

export async function startThreadAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: 'Please sign in to message the maker.' };
  const parsed = startThreadSchema.safeParse({
    ...Object.fromEntries(form),
    imageUrls: images(form),
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  let threadId: string;
  try {
    threadId = await startProductThread(user, parsed.data);
  } catch (err) {
    return toFormState(err);
  }
  redirect(
    user.role === 'seller' ? `/seller/messages/${threadId}` : `/account/messages/${threadId}`,
  );
}

export async function startMakerThreadAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: 'Please sign in to message the maker.' };
  const makerId = z.string().uuid().safeParse(form.get('makerId'));
  const parsed = messageSchema.safeParse({ body: form.get('body'), imageUrls: images(form) });
  if (!makerId.success || !parsed.success)
    return { ok: false, errors: parsed.success ? {} : fieldErrors(parsed.error) };
  let threadId: string;
  try {
    threadId = await startMakerThread(user, { makerId: makerId.data, ...parsed.data });
  } catch (err) {
    return toFormState(err);
  }
  redirect(`/account/messages/${threadId}`);
}

export async function sendMessageAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: 'Please sign in again.' };
  const threadId = z.string().uuid().safeParse(form.get('threadId'));
  const parsed = messageSchema.safeParse({ body: form.get('body'), imageUrls: images(form) });
  if (!threadId.success) return { ok: false, message: 'Conversation not found.' };
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  try {
    await sendMessage(user, { threadId: threadId.data, ...parsed.data });
  } catch (err) {
    return toFormState(err);
  }
  revalidatePath(`/account/messages/${threadId.data}`);
  revalidatePath(`/seller/messages/${threadId.data}`);
  return { ok: true };
}
