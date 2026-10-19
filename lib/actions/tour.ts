'use server';

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { sql } from '@/lib/db';

/** Marks a first-visit tour done (skipped or finished), so it doesn't show again. */
export async function completeTourAction(kind: 'customer' | 'studio') {
  const user = await requireUser();
  if (kind === 'studio')
    await sql()`update public.users set studio_tour_completed_at = now() where id = ${user.id}`;
  else await sql()`update public.users set tour_completed_at = now() where id = ${user.id}`;
}

/** Account → Help → Replay the tour (and the Studio ? menu). */
export async function replayTourAction(form: FormData) {
  const kind = form.get('kind') === 'studio' ? 'studio' : 'customer';
  const user = await requireUser();
  if (kind === 'studio') {
    await sql()`update public.users set studio_tour_completed_at = null where id = ${user.id}`;
    redirect('/studio');
  }
  await sql()`update public.users set tour_completed_at = null where id = ${user.id}`;
  redirect('/');
}
