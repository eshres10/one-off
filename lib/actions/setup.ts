'use server';

import { redirect } from 'next/navigation';
import { requireSeller } from '@/lib/auth/session';
import { stripeOnboardingLink } from '@/lib/services/claim';

/** /studio/setup step 2: Stripe Connect Express (the account is created now, after approval). */
export async function setupStripeAction() {
  const seller = await requireSeller();
  redirect(await stripeOnboardingLink(seller, '/studio/setup?step=2'));
}
