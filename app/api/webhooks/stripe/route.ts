import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { env } from '@/lib/env';
import { mockPaymentsReachable } from '@/lib/features';
import { log, reportError } from '@/lib/log';
import { payments } from '@/lib/payments';
import { handleStripeEvent } from '@/lib/services/webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Stripe webhook endpoint for both platform events and Connect (connected-account) events.
 * Configure two endpoints in Stripe pointing here: one for the platform (STRIPE_WEBHOOK_SECRET)
 * and one "Connected accounts" endpoint (STRIPE_CONNECT_WEBHOOK_SECRET). The signature is verified
 * against the raw body before anything else happens.
 */
export async function POST(req: Request) {
  // With the mock driver the signing secret has a public default, so never accept mock
  // webhooks on a real deployment (e.g. preview mode).
  if (env().PAYMENTS_DRIVER === 'mock' && !mockPaymentsReachable()) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  const signature = req.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'missing signature' }, { status: 400 });
  const raw = await req.text();
  const e = env();

  let event: Stripe.Event | null = null;
  for (const secret of [e.STRIPE_WEBHOOK_SECRET, e.STRIPE_CONNECT_WEBHOOK_SECRET].filter(
    Boolean,
  ) as string[]) {
    try {
      event = payments().constructEvent(raw, signature, secret);
      break;
    } catch {
      // try the next secret
    }
  }
  if (!event) {
    log.warn('stripe webhook signature verification failed');
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 });
  }

  try {
    const outcome = await handleStripeEvent(event);
    log.info({ eventId: event.id, type: event.type, outcome }, 'stripe webhook');
    return NextResponse.json({ received: true, outcome });
  } catch (err) {
    reportError(err, { eventId: event.id, type: event.type });
    // Non-2xx makes Stripe retry; processing is idempotent.
    return NextResponse.json({ error: 'processing failed' }, { status: 500 });
  }
}
