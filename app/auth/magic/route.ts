import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession, verifyToken } from '@/lib/auth/local';
import { loadUser } from '@/lib/auth/session';
import { claimGuestOrders } from '@/lib/auth/users';

/** Local-driver magic link: verifies the signed one-time token and starts a session. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = env().APP_URL;
  const next = url.searchParams.get('next') ?? '/account';
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/account';
  const userId = await verifyToken(url.searchParams.get('token') ?? '', 'magic');
  if (!userId) return NextResponse.redirect(new URL('/login?error=link', base));
  cookies().set(SESSION_COOKIE, await signSession(userId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: base.startsWith('https://'),
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
  const user = await loadUser(userId);
  if (user) await claimGuestOrders(user.id, user.email);
  return NextResponse.redirect(new URL(safeNext, base));
}
