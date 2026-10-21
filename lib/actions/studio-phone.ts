'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireSeller } from '@/lib/auth/session';
import { sendProgressPhoto } from '@/lib/services/studio-orders';
import { isOwnImageUrl } from '@/lib/storage';
import { toFormState } from './util';
import type { FormState } from '@/lib/validation';

const uuid = z.string().uuid();

/** The camera button on an order: a progress photo straight into the buyer's conversation. */
export async function progressPhotoAction(input: {
  fulfilmentId: string;
  imageUrl: string;
  note?: string;
}): Promise<FormState> {
  const seller = await requireSeller();
  if (!uuid.safeParse(input.fulfilmentId).success)
    return { ok: false, message: 'Order not found.' };
  const url = String(input.imageUrl ?? '');
  if (!isOwnImageUrl(url)) return { ok: false, message: 'Choose a photo first.' };
  try {
    await sendProgressPhoto(seller, input.fulfilmentId, url, input.note ?? '');
    revalidatePath('/studio', 'layout');
    return { ok: true, message: 'Sent to the buyer.' };
  } catch (err) {
    return toFormState(err);
  }
}
