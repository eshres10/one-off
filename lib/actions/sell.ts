'use server';

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { stripeOnboardingLink } from '@/lib/services/claim';
import { saveLabel } from '@/lib/services/sell';
import type { FormState } from '@/lib/validation';
import { toFormState } from './util';

/** /sell/start step 1: the label (creates the shop as a draft). */
export async function saveLabelAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser('/sell/start?step=1');
  try {
    await saveLabel(user, {
      name: String(form.get('name') ?? ''),
      suburb: String(form.get('suburb') ?? ''),
      instagram: String(form.get('instagram') ?? ''),
      makes: form.getAll('makes').map(String),
      modes: form.getAll('modes').map(String),
    });
  } catch (err) {
    return toFormState(err);
  }
  redirect('/sell/start?step=2');
}

/** Step 3: Stripe Connect Express, coming back to /sell/start. */
export async function sellStripeAction() {
  const user = await requireUser('/sell/start?step=3');
  redirect(await stripeOnboardingLink(user, '/sell/start?step=3'));
}
