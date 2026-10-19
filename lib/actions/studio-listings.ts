'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireSeller } from '@/lib/auth/session';
import { withUser } from '@/lib/db';
import { toFormState } from './util';
import type { FormState } from '@/lib/validation';

const uuid = z.string().uuid();

/** Sets one size's stock (steppers on Overview and Listings save straight away). */
export async function setStockAction(variantId: string, stock: number): Promise<FormState> {
  const seller = await requireSeller();
  if (!uuid.safeParse(variantId).success || !Number.isInteger(stock) || stock < 0 || stock > 999)
    return { ok: false, message: 'Stock must be between 0 and 999.' };
  try {
    const rows = await withUser(
      seller,
      (db) => db`
      update public.product_variants v set stock_quantity = ${stock}, updated_at = now()
      from public.products p
      where v.id = ${variantId} and p.id = v.product_id and p.maker_id = ${seller.makerId}
      returning v.id`,
    );
    if (!rows.length) return { ok: false, message: 'That size isn’t yours to change.' };
    revalidatePath('/studio', 'layout');
    return { ok: true };
  } catch (err) {
    return toFormState(err);
  }
}
