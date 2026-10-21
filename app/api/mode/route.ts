import { NextResponse } from 'next/server';
import { MODE_COOKIE } from '@/lib/app/mode-shared';

/**
 * Switches between Shopping and Studio on phones: remembers the mode in a cookie (readable by
 * the app shell, so it reopens where you left off) and sends you on to `next`.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const to = url.searchParams.get('to') === 'studio' ? 'studio' : 'shop';
  const next = url.searchParams.get('next') ?? (to === 'studio' ? '/studio' : '/');
  const safe = next.startsWith('/') && !next.startsWith('//') ? next : '/';
  const res = NextResponse.redirect(new URL(safe, url.origin), 303);
  res.cookies.set(MODE_COOKIE, to, {
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
    secure: url.protocol === 'https:',
  });
  return res;
}
