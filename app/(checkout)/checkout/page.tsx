import { redirect } from 'next/navigation';
import { getCartSessionId } from '@/lib/actions/util';
import { getSessionUser } from '@/lib/auth/session';
import { env } from '@/lib/env';
import { checkoutEnabled } from '@/lib/features';
import { openCheckout } from '@/lib/services/checkout';
import { CartError } from '@/lib/services/cart';
import { SITE } from '@/lib/site/config';
import { CheckoutClient } from '@/components/checkout/CheckoutClient';

export const metadata = { title: 'Checkout', robots: { index: false } };

export default async function CheckoutPage() {
  if (!(await checkoutEnabled())) redirect('/bag');
  const sessionId = getCartSessionId();
  if (!sessionId) redirect('/bag');
  const user = await getSessionUser();
  let view;
  try {
    view = await openCheckout({ sessionId, userId: user?.id ?? null, email: user?.email ?? null });
  } catch (err) {
    if (err instanceof CartError) redirect('/bag');
    throw err;
  }
  const e = env();
  return (
    <CheckoutClient
      initial={view}
      payments={{
        driver: e.PAYMENTS_DRIVER,
        publishableKey: e.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null,
        methods: SITE.payments.methods,
        afterpayInstalments: SITE.payments.afterpayInstalments,
        showGst: SITE.tax.showGstIncludedLine,
      }}
    />
  );
}
