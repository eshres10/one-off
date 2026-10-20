'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth/session';
import { rateLimit } from '@/lib/rate-limit';
import {
  addReturnTracking,
  adminSettleReturn,
  getBuyerReturn,
  markReturnDelivered,
  markReturnReceived,
  reportReturnProblem,
  startReturn,
} from '@/lib/services/returns';
import { toFormState } from './util';

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; message: string };

function fail(err: unknown): { ok: false; message: string } {
  return {
    ok: false,
    message: toFormState(err)?.message ?? 'Something went wrong. Please try again.',
  };
}

const startSchema = z.object({
  orderItemId: z.string().uuid(),
  reason: z.enum(['doesnt_fit', 'not_for_me', 'too_late', 'other']).nullable(),
  reasonNote: z.string().max(1000).nullable(),
  conditionConfirmed: z.boolean(),
});

/** Starts the return and hands back the maker's address, which the buyer only now sees. */
export async function startReturnAction(
  input: z.infer<typeof startSchema>,
): Promise<ActionResult<{ id: string; number: string; address: string | null }>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: 'Please sign in again.' };
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Please check your answers.' };
  try {
    await rateLimit('returnStart', user.id);
    const r = await startReturn(user, parsed.data);
    const view = await getBuyerReturn(user, r.id);
    revalidatePath('/account/orders', 'layout');
    return { ok: true, id: r.id, number: r.number, address: view?.returnAddress ?? null };
  } catch (err) {
    return fail(err);
  }
}

const trackingSchema = z.object({
  returnId: z.string().uuid(),
  carrier: z.enum(['auspost', 'sendle', 'other']),
  tracking: z.string().trim().min(1, 'Add the tracking number').max(80),
});

export async function addReturnTrackingAction(
  input: z.infer<typeof trackingSchema>,
): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: 'Please sign in again.' };
  const parsed = trackingSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Check the tracking number.' };
  try {
    await addReturnTracking(user, parsed.data.returnId, parsed.data);
    revalidatePath('/account/orders', 'layout');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function markReturnReceivedAction(returnId: string): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user || user.role !== 'seller') return { ok: false, message: 'Please sign in again.' };
  try {
    await markReturnReceived(user, z.string().uuid().parse(returnId));
    revalidatePath('/studio/orders');
    revalidatePath('/studio/payouts');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

const problemSchema = z.object({
  returnId: z.string().uuid(),
  note: z
    .string()
    .trim()
    .min(20, 'Tell us what’s wrong with it (at least 20 characters).')
    .max(2000),
  photos: z.array(z.string().max(300)).min(1, 'Add at least one photo.').max(6),
});

export async function reportReturnProblemAction(
  input: z.infer<typeof problemSchema>,
): Promise<ActionResult<{ caseNumber: string }>> {
  const user = await getSessionUser();
  if (!user || user.role !== 'seller') return { ok: false, message: 'Please sign in again.' };
  const parsed = problemSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  try {
    const res = await reportReturnProblem(user, parsed.data.returnId, parsed.data);
    revalidatePath('/studio/orders');
    return { ok: true, caseNumber: res.caseNumber };
  } catch (err) {
    return fail(err);
  }
}

const settleSchema = z.object({
  returnId: z.string().uuid(),
  action: z.enum(['refund', 'reject', 'delivered']),
  note: z.string().trim().max(2000),
});

/** Admin: force a refund, close as not accepted, or mark it delivered back to the maker. */
export async function adminReturnAction(
  input: z.infer<typeof settleSchema>,
): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') return { ok: false, message: 'Only Off One can do that.' };
  const parsed = settleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Please check the form.' };
  try {
    if (parsed.data.action === 'delivered')
      await markReturnDelivered(parsed.data.returnId, new Date());
    else
      await adminSettleReturn(user, parsed.data.returnId, {
        action: parsed.data.action,
        note: parsed.data.note,
      });
    revalidatePath('/admin/returns');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
