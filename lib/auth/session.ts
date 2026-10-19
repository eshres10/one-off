import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { sql, type Role } from '@/lib/db';
import { env } from '@/lib/env';
import { SESSION_COOKIE, verifyToken } from './local';

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
  displayName: string | null;
  makerId: string | null;
  makerSlug: string | null;
  makerStatus: 'draft' | 'pending' | 'approved' | 'paused' | null;
  /** Studio state of the maker's shop: draft, invited, live, holiday or closed. */
  shopStatus: string | null;
}

async function currentAuthUserId(): Promise<string | null> {
  if (env().AUTH_DRIVER === 'supabase') {
    const { supabaseServer } = await import('./supabase');
    const { data } = await supabaseServer().auth.getUser();
    return data.user?.id ?? null;
  }
  const token = cookies().get(SESSION_COOKIE)?.value;
  return token ? verifyToken(token, 'session') : null;
}

export async function loadUser(authUserId: string): Promise<SessionUser | null> {
  const [row] = await sql()<SessionUser[]>`
    select u.id, u.email, u.role, u.display_name, m.id as maker_id, m.slug as maker_slug, m.status as maker_status,
      m.shop_status
    from public.users u left join public.makers m on m.user_id = u.id
    where u.auth_user_id = ${authUserId}`;
  return row ?? null;
}

/** The signed-in user for this request (memoised per request), or null for guests. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const authId = await currentAuthUserId();
  if (!authId) return null;
  return loadUser(authId);
});

export async function requireUser(next = '/account'): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

/**
 * Studio pages: a seller whose shop is live (or on holiday). A maker still setting up goes back
 * to their claim flow; anyone without a shop goes to the waitlist.
 */
export async function requireSeller(): Promise<SessionUser & { makerId: string }> {
  const user = await requireUser('/studio');
  if (user.role !== 'seller' || !user.makerId) redirect('/waitlist');
  if (user.shopStatus !== 'live' && user.shopStatus !== 'holiday' && user.shopStatus !== 'closed')
    redirect('/claim/continue');
  return user as SessionUser & { makerId: string };
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser('/admin');
  if (user.role !== 'admin') redirect('/denied');
  return user;
}
