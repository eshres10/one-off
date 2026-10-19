import { env } from '@/lib/env';
import { UserError } from '@/lib/services/errors';
import { getLaunch } from '@/lib/site/launch';

export const PREVIEW_MESSAGE = 'Opening soon. Join the waitlist.';

/**
 * False before launch: in preview mode (a browse-only deployment) or while the admin keeps the
 * site in waitlist mode. Shops and pieces can be live; buyers just can't check out yet.
 */
export async function checkoutEnabled(): Promise<boolean> {
  if (env().PREVIEW_MODE) return false;
  return (await getLaunch()).mode === 'open';
}

export async function assertCheckoutEnabled() {
  if (!(await checkoutEnabled())) throw new UserError(PREVIEW_MESSAGE);
}

/** The mock Stripe pages and signed-mock webhooks are only for local/dev and e2e builds. */
export function mockPaymentsReachable(): boolean {
  const e = env();
  return (
    e.PAYMENTS_DRIVER === 'mock' &&
    !e.PREVIEW_MODE &&
    (e.NODE_ENV !== 'production' || e.ALLOW_LOCAL_DRIVERS_IN_PRODUCTION)
  );
}

/** Uploads written to local disk don't persist on serverless hosts. */
export function uploadsEnabled(): boolean {
  const e = env();
  return (
    e.STORAGE_DRIVER === 'supabase' ||
    e.NODE_ENV !== 'production' ||
    e.ALLOW_LOCAL_DRIVERS_IN_PRODUCTION
  );
}

/** Magic links are only useful when emails are actually delivered (outbox is dev-only). */
export function magicLinksEnabled(): boolean {
  const e = env();
  return e.AUTH_DRIVER === 'supabase' || e.EMAIL_DRIVER === 'resend' || e.NODE_ENV !== 'production';
}
