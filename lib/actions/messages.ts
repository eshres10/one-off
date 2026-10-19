'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getSessionUser, requireSeller } from '@/lib/auth/session';
import { withUser } from '@/lib/db';
import { sanitizeText } from '@/lib/domain/moderation';
import { isOwnImageUrl } from '@/lib/storage';
import { MESSAGE_MEDIA_PREFIX } from '@/lib/message-media';
import { startDepositCheckout } from '@/lib/services/commissions';
import {
  blockBuyer,
  openMakerThread,
  openProductThread,
  reportThread,
  sendMessage,
  sendQuote,
  setNeedsReply,
  startMakerThread,
  startProductThread,
} from '@/lib/services/messaging';
import { fieldErrors, messageSchema, startThreadSchema, type FormState } from '@/lib/validation';
import { toFormState } from './util';

const uuid = z.string().uuid();

/** Photos must be our own uploads, and message photos must be the sender's own. */
function images(form: FormData, userId: string) {
  return form
    .getAll('imageUrls')
    .map(String)
    .filter(
      (u) =>
        u &&
        isOwnImageUrl(u) &&
        (!u.startsWith(MESSAGE_MEDIA_PREFIX) || u.startsWith(`${MESSAGE_MEDIA_PREFIX}${userId}/`)),
    );
}

function revalidateThread(threadId: string) {
  revalidatePath('/messages');
  revalidatePath(`/messages/${threadId}`);
  revalidatePath('/studio/messages');
  revalidatePath(`/studio/messages/${threadId}`);
}

/** "Ask the maker": opens (or creates) the conversation for this piece and goes straight in. */
export async function openThreadAction(form: FormData): Promise<void> {
  const productId = uuid.parse(form.get('productId'));
  const variant = uuid.safeParse(form.get('variantId'));
  const user = await getSessionUser();
  if (!user) {
    const back = String(form.get('returnTo') ?? '/');
    redirect(`/login?next=${encodeURIComponent(back.startsWith('/') ? back : '/')}`);
  }
  const threadId = await openProductThread(user, {
    productId,
    variantId: variant.success ? variant.data : undefined,
  });
  redirect(`/messages/${threadId}`);
}

/** "Ask a question" on a maker profile. */
export async function openMakerThreadAction(form: FormData): Promise<void> {
  const makerId = uuid.parse(form.get('makerId'));
  const user = await getSessionUser();
  if (!user) {
    const back = String(form.get('returnTo') ?? '/');
    redirect(`/login?next=${encodeURIComponent(back.startsWith('/') ? back : '/')}`);
  }
  const threadId = await openMakerThread(user, makerId);
  redirect(`/messages/${threadId}`);
}

export async function startThreadAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: 'Please sign in to message the maker.' };
  const parsed = startThreadSchema.safeParse({
    ...Object.fromEntries(form),
    imageUrls: images(form, user.id),
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  let threadId: string;
  try {
    threadId = await startProductThread(user, parsed.data);
  } catch (err) {
    return toFormState(err);
  }
  redirect(`/messages/${threadId}`);
}

export async function startMakerThreadAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: 'Please sign in to message the maker.' };
  const makerId = uuid.safeParse(form.get('makerId'));
  const parsed = messageSchema.safeParse({
    body: form.get('body'),
    imageUrls: images(form, user.id),
  });
  if (!makerId.success || !parsed.success)
    return { ok: false, errors: parsed.success ? {} : fieldErrors(parsed.error) };
  let threadId: string;
  try {
    threadId = await startMakerThread(user, { makerId: makerId.data, ...parsed.data });
  } catch (err) {
    return toFormState(err);
  }
  redirect(`/messages/${threadId}`);
}

export async function sendMessageAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: 'Please sign in again.' };
  const threadId = uuid.safeParse(form.get('threadId'));
  const parsed = messageSchema.safeParse({
    body: form.get('body'),
    imageUrls: images(form, user.id),
  });
  if (!threadId.success) return { ok: false, message: 'Conversation not found.' };
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  try {
    await sendMessage(user, { threadId: threadId.data, ...parsed.data });
  } catch (err) {
    return toFormState(err);
  }
  revalidateThread(threadId.data);
  return { ok: true };
}

const quoteSchema = z.object({
  threadId: uuid,
  price: z.coerce
    .number({ invalid_type_error: 'Enter a price' })
    .min(20, 'Quotes start at A$20')
    .max(20000, 'That’s above the maximum quote'),
  depositPct: z.coerce.number().int().min(0).max(100),
  weeks: z.coerce.number().int().min(1, 'At least 1 week').max(52, 'At most 52 weeks'),
  note: z.string().max(1000).optional(),
});

export async function sendQuoteAction(_prev: FormState, form: FormData): Promise<FormState> {
  const seller = await requireSeller();
  const parsed = quoteSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  try {
    await sendQuote(seller, {
      threadId: parsed.data.threadId,
      priceCents: Math.round(parsed.data.price * 100),
      depositPct: parsed.data.depositPct,
      weeks: parsed.data.weeks,
      note: parsed.data.note,
    });
  } catch (err) {
    return toFormState(err);
  }
  revalidateThread(parsed.data.threadId);
  return { ok: true, message: 'Quote sent' };
}

/** Buyer: accept the quote and go to Checkout for the deposit. */
export async function acceptQuoteAction(form: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/messages');
  const requestId = uuid.parse(form.get('requestId'));
  const url = await startDepositCheckout(user, requestId);
  redirect(url);
}

export async function setNeedsReplyAction(form: FormData): Promise<void> {
  const seller = await requireSeller();
  const threadId = uuid.parse(form.get('threadId'));
  await setNeedsReply(seller, threadId, form.get('needsReply') === 'true');
  revalidateThread(threadId);
}

export async function reportThreadAction(form: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  const threadId = uuid.parse(form.get('threadId'));
  await reportThread(user, threadId);
  revalidateThread(threadId);
}

export async function blockBuyerAction(form: FormData): Promise<void> {
  const seller = await requireSeller();
  const threadId = uuid.parse(form.get('threadId'));
  await blockBuyer(seller, threadId);
  revalidateThread(threadId);
}

const replySchema = z.object({
  title: z.string().trim().min(1, 'Give it a label').max(40),
  body: z.string().trim().min(1, 'Write the reply').max(1000),
});

/** "+ New" saved reply from the studio composer. */
export async function createSavedReplyAction(_prev: FormState, form: FormData): Promise<FormState> {
  const seller = await requireSeller();
  const parsed = replySchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  await withUser(
    seller,
    (db) => db`
      insert into public.reply_templates (maker_id, title, body)
      values (${seller.makerId}, ${sanitizeText(parsed.data.title)}, ${sanitizeText(parsed.data.body)})`,
  );
  revalidatePath('/studio/messages', 'layout');
  return { ok: true };
}
