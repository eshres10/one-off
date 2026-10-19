import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

const safeNext = (n: string | null) => (n && n.startsWith('/') && !n.startsWith('//') ? n : '/');

/** Starts Apple / Google sign-in with Supabase (only providers listed in AUTH_OAUTH_PROVIDERS). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const provider = url.searchParams.get('provider') ?? '';
  const e = env();
  const allowed = e.AUTH_OAUTH_PROVIDERS.split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (
    e.AUTH_DRIVER !== 'supabase' ||
    !allowed.includes(provider) ||
    !['google', 'apple'].includes(provider)
  )
    return NextResponse.redirect(new URL('/login', e.APP_URL));
  const { supabaseServer } = await import('@/lib/auth/supabase');
  const { data, error } = await supabaseServer().auth.signInWithOAuth({
    provider: provider as 'google' | 'apple',
    options: {
      redirectTo: `${e.APP_URL}/auth/callback?next=${encodeURIComponent(safeNext(url.searchParams.get('next')))}`,
    },
  });
  if (error || !data.url) return NextResponse.redirect(new URL('/login?error=oauth', e.APP_URL));
  return NextResponse.redirect(data.url);
}
