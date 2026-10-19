'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { rateLimit } from '@/lib/rate-limit';
import { addToCart, updateCartItem } from '@/lib/services/cart';
import { createCheckout } from '@/lib/services/checkout';
import {
  addToCartSchema,
  emailSchema,
  fieldErrors,
  updateCartSchema,
  type FormState,
} from '@/lib/validation';
import { clientIp, ensureCartSessionId, getCartSessionId, toFormState } from './util';

const MEASURES = ['bust', 'waist', 'hips', 'height'] as const;

/** Custom-size measurements from the form (cm), or null when none were given. */
function customMeasurements(form: FormData): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const m of MEASURES) {
    const v = Number(form.get(`measure_${m}`));
    if (Number.isFinite(v) && v >= 30 && v <= 250) out[m] = `${Math.round(v)} cm`;
  }
  return Object.keys(out).length ? out : null;
}

export async function addToBagAction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = addToCartSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return {
      ok: false,
      errors: fieldErrors(parsed.error),
      message: parsed.error.issues[0]?.message,
    };
  try {
    const user = await getSessionUser();
    await addToCart({
      sessionId: ensureCartSessionId(),
      userId: user?.id ?? null,
      ...parsed.data,
      customMeasurements: customMeasurements(form),
    });
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Added to your bag' };
  } catch (err) {
    return toFormState(err);
  }
}

export async function updateCartAction(form: FormData): Promise<void> {
  const parsed = updateCartSchema.safeParse(Object.fromEntries(form));
  const sessionId = getCartSessionId();
  if (!parsed.success || !sessionId) return;
  try {
    await updateCartItem(sessionId, parsed.data.itemId, parsed.data.quantity);
  } catch {
    // Quantity beyond stock: leave the line unchanged; the bag shows the limit.
  }
  revalidatePath('/', 'layout');
}

export async function checkoutAction(_prev: FormState, form: FormData): Promise<FormState> {
  const sessionId = getCartSessionId();
  if (!sessionId) return { ok: false, message: 'Your bag is empty.' };
  const user = await getSessionUser();
  const rawEmail = String(form.get('email') ?? '').trim();
  const email = user?.email ?? (rawEmail ? emailSchema.safeParse(rawEmail) : null);
  if (email && typeof email !== 'string' && !email.success)
    return { ok: false, errors: { email: 'Enter a valid email address' } };
  let url: string;
  try {
    await rateLimit('checkout', clientIp());
    const result = await createCheckout({
      sessionId,
      userId: user?.id ?? null,
      email: typeof email === 'string' ? email : email?.success ? email.data : null,
      returnsAck: form.get('returnsAck') === 'on',
      giftNote: String(form.get('giftNote') ?? '').slice(0, 300),
    });
    url = result.url;
  } catch (err) {
    return toFormState(err);
  }
  redirect(url);
}
