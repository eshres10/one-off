import { env } from '@/lib/env';
import { UserError } from '@/lib/services/errors';

export const PREVIEW_MESSAGE =
  'Checkout opens at launch — save pieces you love and we’ll let you know.';

/** False in preview mode (browse-only launch): no bag, checkout or payment webhooks. */
export function checkoutEnabled(): boolean {
  return !env().PREVIEW_MODE;
}

export function assertCheckoutEnabled() {
  if (!checkoutEnabled()) throw new UserError(PREVIEW_MESSAGE);
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
