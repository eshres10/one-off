'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/session';
import {
  assignHelpRequest,
  closeHelpRequest,
  noteHelpRequest,
  sendHelpRequestToMaker,
} from '@/lib/services/help-requests';
import type { FormState } from '@/lib/validation';
import { toFormState } from './util';

const uuid = z.string().uuid();

export async function assignHelpAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  await assignHelpRequest(admin, uuid.parse(form.get('id')));
  revalidatePath('/admin/help-requests');
}

export async function sendToMakerAction(_prev: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const id = uuid.safeParse(form.get('id'));
  const makerId = uuid.safeParse(form.get('makerId'));
  if (!id.success) return { ok: false, message: 'Help request not found.' };
  if (!makerId.success) return { ok: false, message: 'Pick a shop.' };
  try {
    await sendHelpRequestToMaker(admin, id.data, makerId.data);
    revalidatePath('/admin/help-requests');
    revalidatePath('/studio', 'layout');
    return { ok: true, message: 'Sent. The maker has 48 hours to quote.' };
  } catch (err) {
    return toFormState(err);
  }
}

export async function noteHelpAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  await noteHelpRequest(admin, uuid.parse(form.get('id')), String(form.get('note') ?? ''));
  revalidatePath('/admin/help-requests');
}

export async function closeHelpAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  await closeHelpRequest(admin, uuid.parse(form.get('id')));
  revalidatePath('/admin/help-requests');
}
