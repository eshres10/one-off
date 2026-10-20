import { afterEach, describe, expect, it, vi } from 'vitest';

const setEnv = (vars: Record<string, string>) => {
  for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function providers() {
  vi.resetModules();
  const { oauthProviders } = await import('@/lib/auth/oauth');
  return oauthProviders();
}

describe('Google sign-in switch', () => {
  it('is off with local auth, whatever the setting says', async () => {
    setEnv({ AUTH_DRIVER: 'local', AUTH_OAUTH_PROVIDERS: 'google' });
    expect(await providers()).toEqual([]);
  });

  it('shows the providers listed, ignoring unknown ones', async () => {
    setEnv({
      AUTH_DRIVER: 'supabase',
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
      AUTH_OAUTH_PROVIDERS: ' google , facebook',
    });
    expect(await providers()).toEqual(['google']);
  });
});
