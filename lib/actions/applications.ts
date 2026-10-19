'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/session';
import {
  approveApplication,
  declineApplication,
  requestChanges,
  resolveSpotCheck,
  saveInternalNote,
  type DeclineReason,
} from '@/lib/services/applications';
import type { FormState } from '@/lib/validation';
import { toFormState } from './util';

const uuid = z.string().uuid();
const idFrom = (form: FormData, key = 'makerId') => uuid.parse(String(form.get(key) ?? ''));

async function run(fn: () => Promise<unknown>, then: string): Promise<FormState> {
  try {
    await fn();
  } catch (err) {
    return toFormState(err);
  }
  revalidatePath('/admin', 'layout');
  redirect(then);
}

export async function approveAction(_prev: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const id = idFrom(form);
  return run(
    () => approveApplication(admin, id, { founding: form.get('founding') === 'on' }),
    `/admin/applications/${id}?done=approved`,
  );
}

export async function requestChangesAction(_prev: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const id = idFrom(form);
  return run(
    () => requestChanges(admin, id, String(form.get('note') ?? '')),
    `/admin/applications/${id}?done=changes`,
  );
}

export async function declineAction(_prev: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const id = idFrom(form);
  return run(
    () =>
      declineApplication(admin, id, {
        reason: String(form.get('reason') ?? '') as DeclineReason,
        personal: String(form.get('personal') ?? ''),
      }),
    `/admin/applications/${id}?done=declined`,
  );
}

export async function internalNoteAction(_prev: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  try {
    await saveInternalNote(admin, idFrom(form), String(form.get('note') ?? ''));
  } catch (err) {
    return toFormState(err);
  }
  return { ok: true, message: 'Saved.' };
}

export async function spotCheckAction(_prev: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const unpublish = form.get('decision') === 'unpublish';
  return run(
    () =>
      resolveSpotCheck(admin, idFrom(form, 'productId'), {
        unpublish,
        note: String(form.get('note') ?? ''),
      }),
    '/admin/applications?tab=spot-checks',
  );
}
