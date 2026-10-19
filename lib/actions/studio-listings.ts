'use server';

import { createListingRequest, markShopLinkCopied } from '@/lib/services/studio-states';
import { sendRestockAlerts } from '@/lib/services/restock';
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
import { EMPTY_STORY, STORY_LIMITS } from '@/lib/listings/story';
import { getSessionUser, requireSeller } from '@/lib/auth/session';

const uuid = z.string().uuid();

const draftSchema = z.object({
  title: z.string().max(200),
  category: z.string().max(40),
  description: z.string().max(5000),
  fabric: z.string().max(400),
  care: z.string().max(600),
  occasions: z.array(z.string().max(40)).max(12),
  styleTags: z.array(z.string().max(30)).max(8).default([]),
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
  story: z
    .object({
      quote: z.string().max(STORY_LIMITS.quote + 20),
      inspiration: z.string().max(STORY_LIMITS.inspiration + 50),
      details: z.array(z.string().max(STORY_LIMITS.detail + 10)).max(STORY_LIMITS.details),
      fabric: z.string().max(STORY_LIMITS.fabric + 20),
      hoursToMake: z.number().int().min(0).max(STORY_LIMITS.hoursMax).nullable(),
      closeups: z
        .array(
          z.object({
            path: z.string().max(500),
            caption: z.string().max(STORY_LIMITS.caption + 20),
          }),
        )
        .max(STORY_LIMITS.closeups),
    })
    .default(EMPTY_STORY),
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
      returning v.id, v.product_id`,
    );
    if (!rows.length) return { ok: false, message: 'That size isn’t yours to change.' };
    if (stock > 0) await sendRestockAlerts((rows[0] as unknown as { productId: string }).productId);
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

/** Ticks "Share your shop link" on the first-order checklist. */
export async function shopLinkCopiedAction(): Promise<void> {
  const seller = await requireSeller();
  await markShopLinkCopied(seller.makerId!);
  revalidatePath('/studio/orders');
}

/** "Send us photos, we'll list it". */
export async function listingRequestAction(_prev: FormState, form: FormData): Promise<FormState> {
  const seller = await requireSeller();
  try {
    await createListingRequest(
      { id: seller.id, makerId: seller.makerId! },
      {
        photoUrls: form.getAll('photoUrls').map(String),
        note: String(form.get('note') ?? ''),
      },
    );
  } catch (err) {
    return toFormState(err);
  }
  return {
    ok: true,
    message:
      'Thanks! We’ll list it and let you know when it’s up, usually within two business days.',
  };
}
