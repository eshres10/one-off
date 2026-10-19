'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import {
  saveApplicationLabel,
  saveApplicationWork,
  submitApplication,
  type MadeBy,
} from '@/lib/services/apply';
import { sendSupportMessage } from '@/lib/services/support';
import type { FormState } from '@/lib/validation';
import { toFormState } from './util';

const str = (form: FormData, k: string) => String(form.get(k) ?? '');

/** /sell/apply step 1: the label (creates the application as a draft). */
export async function saveLabelAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser('/sell/apply?step=1');
  try {
    await saveApplicationLabel(user, {
      name: str(form, 'name'),
      ownerName: str(form, 'ownerName'),
      email: str(form, 'email'),
      mobile: str(form, 'mobile'),
      suburb: str(form, 'suburb'),
      state: str(form, 'state'),
      instagram: str(form, 'instagram'),
      website: str(form, 'website'),
      makes: form.getAll('makes').map(String),
      modes: form.getAll('modes').map(String),
    });
  } catch (err) {
    return toFormState(err);
  }
  revalidatePath('/', 'layout');
  redirect('/sell/apply?step=2');
}

/** Step 2: the work. */
export async function saveWorkAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser('/sell/apply?step=2');
  try {
    await saveApplicationWork(user, {
      photos: form.getAll('photos').map(String),
      madeBy: str(form, 'madeBy') as MadeBy,
      madeByDetail: str(form, 'madeByDetail'),
      process: str(form, 'process'),
      fabrics: str(form, 'fabrics'),
      declaration: form.get('declaration') === 'on',
    });
  } catch (err) {
    return toFormState(err);
  }
  redirect('/sell/apply?step=3');
}

/** Step 3: send it (or resend it after changes were asked for). */
export async function submitApplicationAction(_prev: FormState): Promise<FormState> {
  const user = await requireUser('/sell/apply?step=3');
  try {
    await submitApplication(user);
  } catch (err) {
    return toFormState(err);
  }
  revalidatePath('/', 'layout');
  redirect('/sell/apply?step=4');
}

/** "Need to change something? Message us." while the application is under review. */
export async function applicationMessageAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const user = await requireUser('/sell/apply');
  try {
    await sendSupportMessage(user, str(form, 'body'), 'Application');
  } catch (err) {
    return toFormState(err);
  }
  return { ok: true, message: 'Sent. We’ll reply by email.' };
}
