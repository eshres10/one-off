'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { env } from '@/lib/env';
import { mockPaymentsReachable } from '@/lib/features';
import { mockStripe } from '@/lib/payments/mock';
import { payments } from '@/lib/payments';

function assertMock() {
  if (!mockPaymentsReachable()) throw new Error('Mock payments are disabled');
}

const paySchema = z.object({
  sessionId: z.string().startsWith('cs_mock_'),
  email: z.string().email(),
  name: z.string().min(1).max(120),
  line1: z.string().min(1).max(200),
  city: z.string().min(1).max(100),
  state: z.string().min(2).max(3),
  postalCode: z.string().regex(/^\d{4}$/),
  card: z.string(),
});

/** Simulates a buyer paying on Stripe Checkout, then delivers a signed webhook to our endpoint. */
export async function mockPayAction(form: FormData) {
  assertMock();
  const input = paySchema.parse(Object.fromEntries(form));
  const declined = input.card.replace(/\s/g, '') === '4000000000000002';
  const session = await payments().retrieveCheckoutSession(input.sessionId);
  const successUrl = (session as unknown as { successUrl: string }).successUrl;

  if (declined) {
    const event = mockStripe.event('payment_intent.payment_failed', {
      id: `pi_mock_declined_${input.sessionId.slice(-10)}`,
      object: 'payment_intent',
      metadata: { order_id: session.metadata.order_id },
      last_payment_error: { code: 'card_declined' },
    });
    await deliver(event);
    redirect(`/dev/checkout/${input.sessionId}?declined=1`);
  }

  const paid = await mockStripe.markSessionPaid(input.sessionId, {
    email: input.email,
    name: input.name,
    address: {
      line1: input.line1,
      city: input.city,
      state: input.state,
      postal_code: input.postalCode,
    },
  });
  await deliver(
    mockStripe.event('checkout.session.completed', {
      id: paid.id,
      object: 'checkout.session',
      payment_status: 'paid',
    }),
  );
  redirect(successUrl.replace('{CHECKOUT_SESSION_ID}', paid.id));
}

async function deliver(event: Record<string, unknown>) {
  const { payload, header } = mockStripe.signEvent(event);
  const res = await fetch(`${env().APP_URL}/api/webhooks/stripe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': header },
    body: payload,
  });
  if (!res.ok) throw new Error(`Webhook delivery failed: ${res.status}`);
}

export async function mockCompleteOnboardingAction(form: FormData) {
  assertMock();
  const accountId = z.string().startsWith('acct_mock_').parse(form.get('accountId'));
  await mockStripe.completeAccountOnboarding(accountId);
  await deliver(
    mockStripe.event(
      'account.updated',
      {
        id: accountId,
        object: 'account',
        details_submitted: true,
        charges_enabled: true,
        payouts_enabled: true,
        external_accounts: {
          object: 'list',
          data: [{ object: 'bank_account', bank_name: 'Commonwealth Bank', last4: '4821' }],
        },
      },
      accountId,
    ),
  );
  // Back where Stripe would send the maker (the claim flow or payouts).
  const back = String(form.get('returnUrl') ?? '');
  redirect(back.startsWith('/') && !back.startsWith('//') ? back : '/studio/payouts?onboarded=1');
}
