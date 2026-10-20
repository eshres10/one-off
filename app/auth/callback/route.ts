import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { afterSignIn } from '@/lib/auth/onboarding';
import { loadUser } from '@/lib/auth/session';
import { claimGuestOrders, ensureAppUser } from '@/lib/auth/users';

/** Supabase Auth callback (magic links, email confirmation, seller invites). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = env().APP_URL;
  const next = url.searchParams.get('next') ?? '/account';
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/account';
  const code = url.searchParams.get('code');
  // Back from Google or Apple: a cancel or failure there gets its own message, not "link expired".
  const failed = url.searchParams.get('via') ? '/login?error=oauth' : '/login?error=link';
  if (env().AUTH_DRIVER !== 'supabase' || !code)
    return NextResponse.redirect(new URL(failed, base));
  const { supabaseServer } = await import('@/lib/auth/supabase');
  const { data, error } = await supabaseServer().auth.exchangeCodeForSession(code);
  if (error || !data.user?.email) return NextResponse.redirect(new URL(failed, base));
  await ensureAppUser(
    data.user.id,
    data.user.email,
    ((data.user.user_metadata?.full_name ?? data.user.user_metadata?.name) as string | undefined) ??
      null,
  );
  await claimGuestOrders(data.user.id, data.user.email);
  const user = await loadUser(data.user.id);
  return NextResponse.redirect(
    new URL(user ? await afterSignIn(user.id, safeNext) : safeNext, base),
  );
}
