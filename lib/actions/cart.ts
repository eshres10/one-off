'use server';

import { bumpTaste } from '@/lib/services/taste';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { rateLimit } from '@/lib/rate-limit';
import { addToCart, updateCartItem } from '@/lib/services/cart';
import { addToCartSchema, fieldErrors, updateCartSchema, type FormState } from '@/lib/validation';
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
    await bumpTaste(user?.id, parsed.data.productId, 2);
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
