'use server';

import { revalidatePath } from 'next/cache';
import { getSessionUser } from '@/lib/auth/session';
import { sql } from '@/lib/db';
import { env } from '@/lib/env';
import { mockPaymentsReachable } from '@/lib/features';
import { mockStripe } from '@/lib/payments/mock';
import { rateLimit } from '@/lib/rate-limit';
import {
  checkoutView,
  expressCheckout,
  preparePayment,
  quoteForState,
  saveCheckoutDelivery,
  saveCheckoutDetails,
  setCheckoutSpeed,
  setSaveDetails,
  type CheckoutAddress,
  type CheckoutView,
} from '@/lib/services/checkout';
import { isUserFacing } from '@/lib/services/errors';
import { CartError } from '@/lib/services/cart';
import { reportError } from '@/lib/log';
import { clientIp, getCartSessionId } from './util';

export type CheckoutResult<T = CheckoutView> =
  | { ok: true; view: T }
  | { ok: false; message: string };

async function owner() {
  const sessionId = getCartSessionId();
  if (!sessionId) throw new CartError('Your bag is empty.');
  const user = await getSessionUser();
  return { sessionId, userId: user?.id ?? null, email: user?.email ?? null };
}

async function run<T>(
  fn: () => Promise<T>,
): Promise<{ ok: true; view: T } | { ok: false; message: string }> {
  try {
    return { ok: true, view: await fn() };
  } catch (err) {
    if (err instanceof CartError || isUserFacing(err))
      return { ok: false, message: (err as Error).message };
    reportError(err, { where: 'checkout' });
    return { ok: false, message: 'Something went wrong. Please try again.' };
  }
}

export async function saveDetailsAction(input: { email: string; phone: string }) {
  return run(async () => {
    const o = await owner();
    await saveCheckoutDetails(o, input);
    return checkoutView(o);
  });
}

export async function saveDeliveryAction(input: {
  address: Partial<CheckoutAddress>;
  speeds: Record<string, string>;
  giftNote?: string;
  /** False: just re-price for the address (the buyer is still on this step). */
  advance?: boolean;
}) {
  return run(async () => {
    const o = await owner();
    await saveCheckoutDelivery(o, input, new Date(), input.advance ?? true);
    if (input.giftNote !== undefined) {
      const view = await checkoutView(o);
      await sql()`update public.orders set gift_note = ${input.giftNote.trim().slice(0, 300) || null}
        where id = ${view.orderId} and status = 'pending'`;
    }
    return checkoutView(o);
  });
}

export async function setSpeedAction(makerId: string, speed: string) {
  return run(async () => {
    const o = await owner();
    await setCheckoutSpeed(o, makerId, speed);
    return checkoutView(o);
  });
}

export async function setSaveDetailsAction(on: boolean) {
  return run(async () => {
    const o = await owner();
    await setSaveDetails(o, on);
    return checkoutView(o);
  });
}

/** Pay: returns the PaymentIntent client secret for Stripe.js to confirm. */
export async function preparePaymentAction(expectedTotalCents?: number) {
  return run(async () => {
    await rateLimit('checkout', clientIp());
    return preparePayment(
      await owner(),
      new Date(),
      typeof expectedTotalCents === 'number' ? expectedTotalCents : undefined,
    );
  });
}

/** Express checkout: the wallet's details, then the payment to confirm. */
export async function expressCheckoutAction(input: {
  email: string;
  phone: string;
  address: Partial<CheckoutAddress>;
}) {
  return run(async () => {
    await rateLimit('checkout', clientIp());
    return expressCheckout(await owner(), input);
  });
}

/** Express checkout's shipping address change: the new total for that state. */
export async function expressQuoteAction(state: string) {
  return run(async () => quoteForState(await owner(), state));
}

/**
 * Local and e2e only: "pays" the PaymentIntent the way Stripe.js would, then delivers a signed
 * payment_intent.succeeded webhook to our real endpoint. Returns the order number.
 */
export async function mockPayAction(method: string) {
  return run(async () => {
    if (!mockPaymentsReachable()) throw new CartError('Test payments are switched off.');
    const prepared = await preparePayment(await owner());
    await mockStripe.succeedPaymentIntent(
      prepared.paymentIntentId,
      method === 'afterpay' ? 'afterpay_clearpay' : 'card',
    );
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
  });
}

/** Local and e2e only: express checkout with a test wallet, start to finish. */
export async function mockExpressAction() {
  return run(async () => {
    if (!mockPaymentsReachable()) throw new CartError('Test payments are switched off.');
    const o = await owner();
    const user = o.userId ? await getSessionUser() : null;
    await expressCheckout(o, {
      email: user?.email ?? 'wallet.buyer@express.test',
      phone: '0400 000 000',
      address: {
        name: user?.displayName ?? 'Wallet Buyer',
        line1: '12 Gertrude St',
        line2: '',
        suburb: 'Fitzroy',
        state: 'VIC',
        postcode: '3065',
      },
    });
    const paid = await mockPayAction('card');
    if (!paid.ok) throw new CartError(paid.message);
    return paid.view;
  });
}
