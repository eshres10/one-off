'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth/session';
import { setContacted } from '@/lib/services/survey';

/** "Mark contacted" on an opt-in row (admin only). */
export async function markContactedAction(id: string, contacted: boolean) {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') return { ok: false as const, message: 'Not allowed.' };
  if (!z.string().uuid().safeParse(id).success) return { ok: false as const, message: 'Bad id.' };
  await setContacted(id, Boolean(contacted));
  revalidatePath('/admin/survey');
  return { ok: true as const };
}
