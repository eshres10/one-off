'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/session';
import { setShippingOffer } from '@/lib/shipping/settings';
import type { FormState } from '@/lib/validation';
import { toFormState } from './util';

export async function setShippingOfferAction(_prev: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  try {
    await setShippingOffer(admin, {
      enabled: form.get('enabled') === 'on',
      extraMaker: String(form.get('extraMaker') ?? ''),
      cap: String(form.get('cap') ?? ''),
      freeOver: String(form.get('freeOver') ?? ''),
      monthlyBudget: String(form.get('monthlyBudget') ?? ''),
    });
  } catch (err) {
    return toFormState(err);
  }
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Saved. New prices apply to bags from now on.' };
}
