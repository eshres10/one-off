'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth/session';
import { withUser } from '@/lib/db';

const id = z.string().uuid();

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
    await db`insert into public.saved_items (user_id, product_id) values (${user.id}, ${pid}) on conflict do nothing`;
    return true;
  });
  // save_count is platform-managed (not writable by sellers/buyers), so update it with the service role.
  const { sql } = await import('@/lib/db');
  await sql()`update public.products set save_count = greatest(0, save_count + ${saved ? 1 : -1}) where id = ${pid}`;
  revalidatePath('/account/saved');
  return { saved };
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
  return { following };
}
