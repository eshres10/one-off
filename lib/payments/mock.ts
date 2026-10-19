import { randomUUID } from 'node:crypto';
import Stripe from 'stripe';
import { sql } from '@/lib/db';
import { env } from '@/lib/env';
import type { CheckoutSessionInfo, PaymentsDriver } from './types';

// Only used for signature helpers; never makes network calls.
const offline = new Stripe('sk_test_offline_mock', { typescript: true });

async function put(id: string, type: string, data: Record<string, unknown>) {
  await sql()`
    insert into public.mock_stripe_objects (id, type, data) values (${id}, ${type}, ${sql().json(data as never)})
    on conflict (id) do update set data = excluded.data`;
}

async function get<T>(id: string): Promise<T | null> {
  const [row] = await sql()<
    { data: T }[]
  >`select data from public.mock_stripe_objects where id = ${id}`;
  return row?.data ?? null;
}

/**
 * Local stand-in for Stripe used in development, CI and Playwright. Checkout redirects to
 * /dev/checkout/[id]; "paying" there marks the session paid and delivers a correctly signed
 * webhook to the real /api/webhooks/stripe handler.
 */
export function createMockDriver(): PaymentsDriver {
  return {
    name: 'mock',

    async createCheckoutSession(input) {
      const id = `cs_mock_${randomUUID().replace(/-/g, '')}`;
      const amountTotal =
        input.lineItems.reduce((s, li) => s + li.amountCents * li.quantity, 0) +
        input.shippingCents;
      const session: CheckoutSessionInfo & {
        lineItems: unknown;
        successUrl: string;
        cancelUrl: string;
        shippingLabel: string;
        shippingCents: number;
        submitMessage: string;
        termsUrl: string;
      } = {
        id,
        paymentStatus: 'unpaid',
        status: 'open',
        amountTotal,
        currency: 'aud',
        paymentIntentId: null,
        chargeId: null,
        customerEmail: input.customerEmail ?? null,
        customerName: null,
        shippingAddress: null,
        metadata: {
          order_id: input.orderId,
          order_number: input.orderNumber,
          cart_id: input.cartId,
          returns_ack_at: input.returnsAckAt,
          returns_policy_version: input.returnsPolicyVersion,
        },
        submitMessage: input.submitMessage,
        termsUrl: input.termsUrl,
        lineItems: input.lineItems,
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
        shippingLabel: input.shippingLabel,
        shippingCents: input.shippingCents,
      };
      await put(id, 'checkout.session', session as unknown as Record<string, unknown>);
      return { id, url: `${env().APP_URL}/dev/checkout/${id}` };
    },

    async createDepositSession(input) {
      const id = `cs_mock_${randomUUID().replace(/-/g, '')}`;
      await put(id, 'checkout.session', {
        id,
        paymentStatus: 'unpaid',
        status: 'open',
        amountTotal: input.amountCents,
        currency: 'aud',
        paymentIntentId: null,
        chargeId: null,
        customerEmail: input.customerEmail ?? null,
        customerName: null,
        shippingAddress: null,
        metadata: {
          kind: 'commission_deposit',
          commission_request_id: input.requestId,
          quote_id: input.quoteId,
        },
        lineItems: [
          {
            name: input.title,
            description: input.description,
            amountCents: input.amountCents,
            quantity: 1,
          },
        ],
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
        shippingLabel: 'Shipping is added to the balance',
        shippingCents: 0,
      });
      return { id, url: `${env().APP_URL}/dev/checkout/${id}` };
    },

    async retrieveCheckoutSession(id) {
      const s = await get<CheckoutSessionInfo>(id);
      if (!s) throw new Error(`No such checkout session: ${id}`);
      return s;
    },

    async createTransfer(input) {
      const existing = await get<{ id: string }>(`idem:${input.idempotencyKey}`);
      if (existing) return existing;
      const id = `tr_mock_${randomUUID().slice(0, 12)}`;
      await put(id, 'transfer', { id, ...input });
      await put(`idem:${input.idempotencyKey}`, 'idempotency', { id });
      return { id };
    },

    async reverseTransfer(transferId, amountCents, idempotencyKey) {
      const existing = await get<{ id: string }>(`idem:${idempotencyKey}`);
      if (existing) return existing;
      const id = `trr_mock_${randomUUID().slice(0, 12)}`;
      await put(id, 'transfer_reversal', { id, transferId, amountCents });
      await put(`idem:${idempotencyKey}`, 'idempotency', { id });
      return { id };
    },

    async createRefund(input) {
      const existing = await get<{ id: string; status: string }>(`idem:${input.idempotencyKey}`);
      if (existing) return existing;
      const id = `re_mock_${randomUUID().slice(0, 12)}`;
      await put(id, 'refund', { id, status: 'succeeded', ...input });
      await put(`idem:${input.idempotencyKey}`, 'idempotency', { id, status: 'succeeded' });
      return { id, status: 'succeeded' };
    },

    async createExpressAccount(input) {
      const id = `acct_mock_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
      await put(id, 'account', {
        id,
        email: input.email,
        makerId: input.makerId,
        detailsSubmitted: false,
      });
      return { id };
    },

    async createAccountLink(accountId) {
      return { url: `${env().APP_URL}/dev/connect/${accountId}` };
    },

    async createLoginLink(accountId) {
      return { url: `${env().APP_URL}/dev/connect/${accountId}?dashboard=1` };
    },

    async retrieveAccount(accountId) {
      const a = await get<{ detailsSubmitted?: boolean }>(accountId);
      const done = a?.detailsSubmitted ?? accountId.startsWith('acct_mock_');
      return { id: accountId, detailsSubmitted: done, chargesEnabled: done, payoutsEnabled: done };
    },

    constructEvent(rawBody, signature, secret) {
      return offline.webhooks.constructEvent(rawBody, signature, secret);
    },
  };
}

/** Mock-only helpers used by the /dev pages and tests. */
export const mockStripe = {
  async markSessionPaid(
    id: string,
    details: { email: string; name: string; address: Record<string, unknown> },
  ) {
    const s = await get<CheckoutSessionInfo>(id);
    if (!s) throw new Error('Unknown session');
    const suffix = id.slice(-16);
    const paid: CheckoutSessionInfo = {
      ...s,
      paymentStatus: 'paid',
      status: 'complete',
      paymentIntentId: `pi_mock_${suffix}`,
      chargeId: `ch_mock_${suffix}`,
      customerEmail: details.email,
      customerName: details.name,
      shippingAddress: { name: details.name, ...details.address, country: 'AU' },
    };
    await put(id, 'checkout.session', paid as unknown as Record<string, unknown>);
    return paid;
  },

  async completeAccountOnboarding(accountId: string) {
    const a = (await get<Record<string, unknown>>(accountId)) ?? { id: accountId };
    await put(accountId, 'account', { ...a, detailsSubmitted: true });
  },

  /** Builds a signed webhook request body + header, exactly as Stripe would send it. */
  signEvent(event: Record<string, unknown>, secret: string = env().STRIPE_WEBHOOK_SECRET) {
    const payload = JSON.stringify(event);
    const header = offline.webhooks.generateTestHeaderString({ payload, secret });
    return { payload, header };
  },

  event(type: string, object: Record<string, unknown>, account?: string) {
    return {
      id: `evt_mock_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
      object: 'event',
      type,
      api_version: '2025-02-24.acacia',
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      account,
      data: { object },
    };
  },
};
