'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth/session';
import { sql, withUser } from '@/lib/db';
import { addToCart } from '@/lib/services/cart';
import { getPiecesByIds, type SavedPiece } from '@/lib/queries/saved';
import { ensureCartSessionId, getCartSessionId, toFormState } from './util';

const id = z.string().uuid();
const ids = z.array(z.string().uuid()).max(100);

/** save_count is platform-managed (not writable by buyers), so it moves with the service role. */
async function bumpSaveCount(productId: string, delta: number) {
  await sql()`update public.products set save_count = greatest(0, save_count + ${delta}) where id = ${productId}`;
}

function revalidateSaved() {
  revalidatePath('/saved');
  revalidatePath('/account/saved');
}

export async function toggleSaveAction(
  productId: string,
): Promise<{ saved?: boolean; needsLogin?: boolean }> {
  const user = await getSessionUser();
  if (!user) return { needsLogin: true };
  const pid = id.parse(productId);
  const saved = await withUser(user, async (db) => {
    const removed =
      await db`delete from public.saved_items where user_id = ${user.id} and product_id = ${pid} returning id`;
    if (removed.length) return false;
    await db`
      insert into public.saved_items (user_id, product_id, price_at_save)
      select ${user.id}, p.id, p.price_cents from public.products p where p.id = ${pid}
      on conflict do nothing`;
    return true;
  });
  await bumpSaveCount(pid, saved ? 1 : -1);
  revalidateSaved();
  return { saved };
}

/**
 * Explicit save state, used by the Saved page's remove + Undo. Undo restores the original
 * saved price so a price-drop alert isn't lost.
 */
export async function setSavedAction(
  productId: string,
  saved: boolean,
  priceAtSave?: number | null,
): Promise<{ ok: boolean; needsLogin?: boolean }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, needsLogin: true };
  const pid = id.parse(productId);
  const price = z.number().int().positive().nullable().optional().parse(priceAtSave);
  const changed = await withUser(user, async (db) => {
    if (!saved)
      return (
        await db`delete from public.saved_items where user_id = ${user.id} and product_id = ${pid} returning id`
      ).length;
    return (
      await db`
        insert into public.saved_items (user_id, product_id, price_at_save)
        select ${user.id}, p.id, coalesce(${price ?? null}::int, p.price_cents) from public.products p where p.id = ${pid}
        on conflict do nothing returning id`
    ).length;
  });
  if (changed) await bumpSaveCount(pid, saved ? 1 : -1);
  revalidateSaved();
  return { ok: true };
}

/** Moves saves made while signed out (kept in localStorage) into the account. */
export async function mergeLocalSavesAction(productIds: string[]): Promise<{ merged: number }> {
  const user = await getSessionUser();
  if (!user) return { merged: 0 };
  const list = ids.parse(productIds);
  if (!list.length) return { merged: 0 };
  const inserted = await withUser(
    user,
    (db) => db<{ productId: string }[]>`
      insert into public.saved_items (user_id, product_id, price_at_save)
      select ${user.id}, p.id, p.price_cents from public.products p where p.id in ${db(list)}
      on conflict do nothing returning product_id`,
  );
  for (const r of inserted) await bumpSaveCount(r.productId, 1);
  revalidateSaved();
  return { merged: inserted.length };
}

/** Cards for signed-out saves. */
export async function localSavedPiecesAction(productIds: string[]): Promise<SavedPiece[]> {
  const parsed = ids.safeParse(productIds);
  if (!parsed.success) return [];
  return getPiecesByIds(parsed.data, getCartSessionId());
}

export async function addSavedToBagAction(
  productId: string,
  variantId: string,
): Promise<{ ok: boolean; message?: string }> {
  try {
    const user = await getSessionUser();
    await addToCart({
      sessionId: ensureCartSessionId(),
      userId: user?.id ?? null,
      productId: id.parse(productId),
      variantId: id.parse(variantId),
      quantity: 1,
    });
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (err) {
    const state = toFormState(err);
    return { ok: false, message: state?.message ?? 'Couldn’t add this to your bag.' };
  }
}

export async function toggleFollowAction(
  makerId: string,
): Promise<{ following?: boolean; needsLogin?: boolean }> {
  const user = await getSessionUser();
  if (!user) return { needsLogin: true };
  const mid = id.parse(makerId);
  const following = await withUser(user, async (db) => {
    const removed =
      await db`delete from public.maker_follows where user_id = ${user.id} and maker_id = ${mid} returning id`;
    if (removed.length) return false;
    await db`insert into public.maker_follows (user_id, maker_id) values (${user.id}, ${mid}) on conflict do nothing`;
    return true;
  });
  revalidatePath('/account/following');
  revalidatePath('/saved');
  return { following };
}
