import { cached, invalidate } from '@/lib/cache';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import { sql } from '@/lib/db';
import { env } from '@/lib/env';
import { UserError } from '@/lib/services/errors';
import type { LaunchMode } from './config';

export interface LaunchSettings {
  mode: LaunchMode;
  /** YYYY-MM-DD the site opens to buyers, shown to makers while in waitlist mode. */
  opensOn: string | null;
}

/**
 * Until the admin sets it in /admin/launch, launch mode follows PREVIEW_MODE: a browse-only
 * deployment starts in waitlist mode, any other starts open.
 */
const fallback = (): LaunchSettings => ({
  mode: env().PREVIEW_MODE ? 'waitlist' : 'open',
  opensOn: null,
});

/** Launch mode and opening date (site_settings 'launch'), cached for a minute. */
export const getLaunch = cached(
  async (): Promise<LaunchSettings> => {
    try {
      const [row] = await sql()<{ value: Partial<LaunchSettings> }[]>`
        select value from public.site_settings where key = 'launch'`;
      if (!row) return fallback();
      return {
        mode: row.value.mode === 'open' ? 'open' : 'waitlist',
        opensOn: typeof row.value.opensOn === 'string' ? row.value.opensOn : null,
      };
    } catch {
      return fallback();
    }
  },
  ['site-launch'],
  { revalidate: 60, tags: ['site'] },
);

export async function setLaunch(
  admin: Pick<SessionUser, 'id' | 'role'>,
  input: { mode: string; opensOn: string },
) {
  if (admin.role !== 'admin') throw new UserError('Admins only.');
  if (input.mode !== 'open' && input.mode !== 'waitlist') throw new UserError('Pick a mode.');
  const opensOn = /^\d{4}-\d{2}-\d{2}$/.test(input.opensOn) ? input.opensOn : null;
  const value: LaunchSettings = { mode: input.mode, opensOn };
  await sql()`
    insert into public.site_settings (key, value, updated_at, updated_by)
    values ('launch', ${sql().json({ ...value })}, now(), ${admin.id})
    on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`;
  await audit('site.launch_mode', { type: 'site', id: null }, { ...value }, admin.id);
  invalidate('site');
}
