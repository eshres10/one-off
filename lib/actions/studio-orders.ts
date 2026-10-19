'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireSeller, requireUser } from '@/lib/auth/session';
import { withUser } from '@/lib/db';
import { markDelivered } from '@/lib/services/payouts';
import {
  CARRIERS,
  markShipped,
  openOrderThread,
  setMakingStep,
  type Carrier,
} from '@/lib/services/studio-orders';
import type { FormState } from '@/lib/validation';
import { toFormState } from './util';

const uuid = z.string().uuid();

function refresh() {
  revalidatePath('/studio', 'layout');
}

export async function shipOrderAction(_prev: FormState, form: FormData): Promise<FormState> {
  const seller = await requireSeller();
  const id = uuid.safeParse(form.get('fulfilmentId'));
  const carrier = String(form.get('carrier') ?? '');
  if (!id.success) return { ok: false, message: 'Order not found.' };
  if (!(carrier in CARRIERS))
    return { ok: false, errors: { carrier: 'Choose how it’s being sent.' } };
  try {
    const { buyerFirstName } = await markShipped(seller, {
      fulfilmentId: id.data,
      carrier: carrier as Carrier,
      trackingNumber: String(form.get('trackingNumber') ?? ''),
    });
    refresh();
    return {
      ok: true,
      message:
        carrier === 'hand'
          ? `Shipped. ${buyerFirstName} knows it’s on the way.`
          : `Shipped. ${buyerFirstName} has the tracking link.`,
    };
  } catch (err) {
    return toFormState(err);
  }
}

export async function makingStepAction(_prev: FormState, form: FormData): Promise<FormState> {
  const seller = await requireSeller();
  const id = uuid.safeParse(form.get('fulfilmentId'));
  if (!id.success) return { ok: false, message: 'Order not found.' };
  try {
    await setMakingStep(seller, id.data, Number(form.get('step')));
    refresh();
    return { ok: true };
  } catch (err) {
    return toFormState(err);
  }
}

export async function messageBuyerAction(form: FormData): Promise<void> {
  const seller = await requireSeller();
  const id = uuid.parse(form.get('fulfilmentId'));
  const threadId = await openOrderThread(seller, id);
  redirect(`/studio/messages/${threadId}`);
}

/** Buyer: "I've received it" marks their piece delivered straight away. */
export async function confirmReceivedAction(form: FormData): Promise<void> {
  const id = uuid.parse(form.get('fulfilmentId'));
  const user = await requireUser('/account/orders');
  // RLS: the buyer can only see fulfilments on their own orders.
  const [own] = await withUser(
    user,
    (db) => db<{ id: string; orderId: string }[]>`
      select f.id, f.order_id from public.fulfilments f join public.order_summaries o on o.id = f.order_id
      where f.id = ${id} and o.buyer_user_id = ${user.id}`,
  );
  if (!own) return;
  await markDelivered(own.id, 'buyer');
  revalidatePath(`/account/orders/${own.orderId}`);
  revalidatePath('/account/orders');
}
