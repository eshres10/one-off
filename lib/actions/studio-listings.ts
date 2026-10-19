'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { withUser } from '@/lib/db';
import { toFormState } from './util';
import type { FormState } from '@/lib/validation';
import {
  savePiece,
  setPieceLive,
  type SaveIntent,
  type SaveResult,
} from '@/lib/services/studio-listings';
import type { PieceDraft } from '@/lib/studio/pieces';
import { getSessionUser, requireSeller } from '@/lib/auth/session';

const uuid = z.string().uuid();

const draftSchema = z.object({
  title: z.string().max(200),
  category: z.string().max(40),
  description: z.string().max(5000),
  fabric: z.string().max(400),
  care: z.string().max(600),
  occasions: z.array(z.string().max(40)).max(12),
  colours: z.array(z.string().max(30)).max(10),
  saleType: z.enum(['ready_to_ship', 'made_to_order', 'one_of_one']),
  mtoLead: z.string().max(20).nullable(),
  mtoCapacity: z.number().int().min(0).max(500).nullable(),
  sizes: z
    .array(
      z.object({
        size: z.string().max(10),
        stock: z.number().int().min(0).max(999),
        offered: z.boolean(),
      }),
    )
    .max(12),
  priceCents: z.number().int().min(0).max(10_000_000).nullable(),
  acceptsCustom: z.boolean(),
  images: z.array(z.object({ url: z.string().max(500), alt: z.string().max(300) })).max(8),
  measurements: z.array(z.object({ name: z.string().max(60), valueCm: z.number() })).max(20),
});

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

/** The editor saves through here (autosave, Save draft, Publish), as the maker or as One Off. */
export async function savePieceAction(input: {
  id: string | null;
  makerId?: string;
  draft: PieceDraft;
  intent: SaveIntent;
}): Promise<{ ok: true; result: SaveResult } | { ok: false; message: string }> {
  const user = await getSessionUser();
  if (!user || (user.role !== 'seller' && user.role !== 'admin'))
    return { ok: false, message: 'Please sign in again.' };
  if (input.id && !uuid.safeParse(input.id).success)
    return { ok: false, message: 'Piece not found.' };
  try {
    const result = await savePiece(user, input);
    revalidatePath('/studio', 'layout');
    revalidatePath(`/products/${result.slug}`);
    if (user.role === 'admin') revalidatePath('/admin/shops', 'layout');
    return { ok: true, result };
  } catch (err) {
    const state = toFormState(err);
    return { ok: false, message: state?.message ?? 'Couldn’t save. Try again.' };
  }
}

export async function setPieceLiveAction(productId: string, live: boolean): Promise<FormState> {
  const seller = await requireSeller();
  if (!uuid.safeParse(productId).success) return { ok: false, message: 'Piece not found.' };
  try {
    await setPieceLive(seller, productId, live);
    revalidatePath('/studio', 'layout');
    return { ok: true };
  } catch (err) {
    return toFormState(err);
  }
}
