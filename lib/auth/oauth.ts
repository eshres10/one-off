import { env } from '@/lib/env';

export type OAuthProvider = 'google' | 'apple';

/** Sign-in providers switched on in AUTH_OAUTH_PROVIDERS (Supabase Auth only). */
export function oauthProviders(): OAuthProvider[] {
  const e = env();
  if (e.AUTH_DRIVER !== 'supabase') return [];
  return e.AUTH_OAUTH_PROVIDERS.split(',')
    .map((p) => p.trim())
    .filter((p): p is OAuthProvider => p === 'google' || p === 'apple');
}
