'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/session';
import { setLaunch } from '@/lib/site/launch';
import type { FormState } from '@/lib/validation';
import { toFormState } from './util';

export async function setLaunchAction(_prev: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  try {
    await setLaunch(admin, {
      mode: String(form.get('mode') ?? ''),
      opensOn: String(form.get('opensOn') ?? ''),
    });
  } catch (err) {
    return toFormState(err);
  }
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Saved.' };
}
