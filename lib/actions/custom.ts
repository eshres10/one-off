'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getSessionUser } from '@/lib/auth/session';
import type { Brief } from '@/lib/custom/brief';
import { env } from '@/lib/env';
import { mockPaymentsReachable } from '@/lib/features';
import { reportError } from '@/lib/log';
import { mockStripe } from '@/lib/payments/mock';
import type { CheckoutAddress } from '@/lib/services/checkout';
import {
  findMatches,
  lookupPostcode,
  requestHelp,
  savedMeasurements,
  sendRequest,
  type MatchResult,
} from '@/lib/services/custom';
import { prepareCustomPayment } from '@/lib/services/custom-orders';
import { IncompleteBriefError, isUserFacing } from '@/lib/services/errors';
import { openRequestThread } from '@/lib/services/messaging';

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; message: string; signIn?: boolean; step?: number };

async function run<T>(fn: () => Promise<T>, where: string): Promise<Result<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    if (isUserFacing(err))
      return {
        ok: false,
        message: (err as Error).message,
        ...(err instanceof IncompleteBriefError ? { step: err.step } : {}),
      };
    reportError(err, { where });
    return { ok: false, message: 'Something went wrong. Please try again.' };
  }
}

export async function lookupPostcodeAction(postcode: string) {
  return lookupPostcode(String(postcode ?? '').trim());
}

/** "Use my saved sizes": what the account holds, as brief measurements. */
export async function savedSizesAction() {
  const user = await getSessionUser();
  return user ? savedMeasurements(user) : {};
}

/** Matching needs an owner for the request: guests are sent to sign in first. */
export async function findMatchesAction(brief: Partial<Brief>): Promise<Result<MatchResult>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: 'Sign in to find your makers.', signIn: true };
  return run(() => findMatches(brief), 'custom:find');
}

export async function sendRequestAction(brief: Partial<Brief>, makerIds: string[]) {
  const user = await getSessionUser();
  if (!user) return { ok: false as const, message: 'Sign in to send your brief.', signIn: true };
  const res = await run(() => sendRequest(user, brief, makerIds), 'custom:send');
  if (res.ok) revalidatePath('/account/requests');
  return res;
}

export async function requestHelpAction(input: {
  brief?: Partial<Brief>;
  requestId?: string;
  note: string;
}) {
  const user = await getSessionUser();
  if (!user)
    return { ok: false as const, message: 'Sign in so we can get back to you.', signIn: true };
  const res = await run(() => requestHelp(user, input), 'custom:help');
  if (res.ok) revalidatePath('/account/requests');
  return res;
}

/** The PaymentIntent for an accepted quote (real Stripe: the browser confirms it). */
export async function prepareCustomPaymentAction(
  quoteId: string,
  address: Partial<CheckoutAddress>,
) {
  const user = await getSessionUser();
  if (!user) return { ok: false as const, message: 'Sign in to accept the quote.', signIn: true };
  return run(() => prepareCustomPayment(user, quoteId, address), 'custom:pay');
}

/** Local and e2e only: pays the custom order with the mock card and delivers the webhook. */
export async function mockPayCustomAction(quoteId: string, address: Partial<CheckoutAddress>) {
  const user = await getSessionUser();
  if (!user) return { ok: false as const, message: 'Sign in to accept the quote.', signIn: true };
  return run(async () => {
    if (!mockPaymentsReachable()) throw new Error('Test payments are switched off.');
    const prepared = await prepareCustomPayment(user, quoteId, address);
    await mockStripe.succeedPaymentIntent(prepared.paymentIntentId, 'card');
    const event = mockStripe.event('payment_intent.succeeded', {
      id: prepared.paymentIntentId,
      object: 'payment_intent',
      metadata: { order_id: prepared.orderId },
    });
    const { payload, header } = mockStripe.signEvent(event);
    const res = await fetch(`${env().APP_URL}/api/webhooks/stripe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': header },
      body: payload,
    });
    if (!res.ok) throw new Error(`Webhook delivery failed: ${res.status}`);
    revalidatePath('/', 'layout');
    return { orderNumber: prepared.orderNumber };
  }, 'custom:mock pay');
}

/** "Ask" on a quote: opens the conversation with that maker about the request. */
export async function askMakerAction(form: FormData): Promise<void> {
  const requestId = String(form.get('requestId') ?? '');
  const makerId = String(form.get('makerId') ?? '');
  const back = String(form.get('returnTo') ?? '/account/requests');
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(back.startsWith('/') ? back : '/')}`);
  const threadId = await openRequestThread(user, { requestId, makerId });
  redirect(`/messages/${threadId}`);
}
