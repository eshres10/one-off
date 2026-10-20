'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin, requireSeller } from '@/lib/auth/session';
import { reportError } from '@/lib/log';
import {
  cancelCustomOrder,
  setMilestone,
  waiveAdvanceRecovery,
  type MilestoneKey,
} from '@/lib/services/custom-orders';
import {
  passRequest,
  saveCustomSettings,
  sendQuote,
  type CustomSettingsInput,
} from '@/lib/services/custom-studio';
import { isUserFacing } from '@/lib/services/errors';
import type { FormState } from '@/lib/validation';
import { toFormState } from './util';

const uuid = z.string().uuid();

function refresh() {
  revalidatePath('/studio', 'layout');
}

/** "Send quote · A$…" from the quote panel (also "Save changes" on an edit). */
export async function sendQuoteAction(_prev: FormState, form: FormData): Promise<FormState> {
  const seller = await requireSeller();
  const id = uuid.safeParse(form.get('requestId'));
  if (!id.success) return { ok: false, message: 'Request not found.' };
  try {
    const r = await sendQuote(seller, {
      requestId: id.data,
      priceDollars: Number(form.get('price')),
      readyBy: String(form.get('readyBy') ?? ''),
      fittings: String(form.get('fittings') ?? 'none'),
      fabric: String(form.get('fabric') ?? ''),
      note: String(form.get('note') ?? ''),
      sketchPath: String(form.get('sketchPath') ?? '') || null,
      canMakeToMeasurements: form.get('canMake') === 'on',
    });
    refresh();
    revalidatePath('/account/requests', 'layout');
    return { ok: true, message: r.updated ? 'Quote updated.' : 'Quote sent.' };
  } catch (err) {
    return toFormState(err);
  }
}

export async function passRequestAction(_prev: FormState, form: FormData): Promise<FormState> {
  const seller = await requireSeller();
  const id = uuid.safeParse(form.get('requestId'));
  if (!id.success) return { ok: false, message: 'Request not found.' };
  try {
    await passRequest(seller, id.data, String(form.get('reason') ?? ''));
    refresh();
    revalidatePath('/account/requests', 'layout');
    return { ok: true, message: 'Passed. The buyer sees “Not available this time”.' };
  } catch (err) {
    return toFormState(err);
  }
}

export async function saveCustomSettingsAction(
  input: CustomSettingsInput,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const seller = await requireSeller();
  try {
    await saveCustomSettings(seller, input);
    refresh();
    return { ok: true };
  } catch (err) {
    if (isUserFacing(err)) return { ok: false, message: (err as Error).message };
    reportError(err, { where: 'custom settings' });
    return { ok: false, message: 'Something went wrong. Please try again.' };
  }
}

/** A making step on a custom order, with an optional note and photo. */
export async function milestoneAction(_prev: FormState, form: FormData): Promise<FormState> {
  const seller = await requireSeller();
  const id = uuid.safeParse(form.get('orderId'));
  if (!id.success) return { ok: false, message: 'Order not found.' };
  try {
    await setMilestone(seller, id.data, String(form.get('key')) as MilestoneKey, {
      note: String(form.get('note') ?? ''),
      photo: String(form.get('photo') ?? '') || null,
    });
    refresh();
    revalidatePath('/account/orders/[id]', 'page');
    return { ok: true };
  } catch (err) {
    return toFormState(err);
  }
}

export async function cancelCustomOrderAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const seller = await requireSeller();
  const id = uuid.safeParse(form.get('orderId'));
  if (!id.success) return { ok: false, message: 'Order not found.' };
  try {
    const r = await cancelCustomOrder(seller, id.data, String(form.get('reason') ?? ''));
    refresh();
    return {
      ok: true,
      message: `Cancelled and refunded in full.${r.advanceRecovered ? ' The fabric advance comes off your next payouts.' : ''}`,
    };
  } catch (err) {
    return toFormState(err);
  }
}

export async function waiveAdvanceAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = uuid.parse(form.get('orderId'));
  await waiveAdvanceRecovery(admin, id);
  revalidatePath('/admin', 'layout');
}
