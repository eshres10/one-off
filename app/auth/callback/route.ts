import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { claimGuestOrders, ensureAppUser } from '@/lib/auth/users';

/** Supabase Auth callback (magic links, email confirmation, seller invites). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = env().APP_URL;
  const next = url.searchParams.get('next') ?? '/account';
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/account';
  const code = url.searchParams.get('code');
  if (env().AUTH_DRIVER !== 'supabase' || !code)
    return NextResponse.redirect(new URL('/login?error=link', base));
  const { supabaseServer } = await import('@/lib/auth/supabase');
  const { data, error } = await supabaseServer().auth.exchangeCodeForSession(code);
  if (error || !data.user?.email) return NextResponse.redirect(new URL('/login?error=link', base));
  await ensureAppUser(
    data.user.id,
    data.user.email,
    (data.user.user_metadata?.name as string | undefined) ?? null,
  );
  await claimGuestOrders(data.user.id, data.user.email);
  return NextResponse.redirect(new URL(safeNext, base));
}
