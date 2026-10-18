import Stripe from 'stripe';
import type { CheckoutSessionInfo, PaymentsDriver } from './types';

/**
 * Real Stripe driver. Marketplace model: the platform is merchant of record and uses
 * "separate charges and transfers" — one Checkout payment per buyer order, then one transfer per
 * maker (seller net = items − commission + shipping) linked by transfer_group and
 * source_transaction. This supports multi-maker carts (destination charges allow only one
 * connected account per payment), partial refunds with transfer reversals, and disputes.
 */
export function createStripeDriver(secretKey: string): PaymentsDriver {
  const stripe = new Stripe(secretKey, {
    typescript: true,
    maxNetworkRetries: 2,
    appInfo: { name: 'one-off', url: 'https://shoponeoff.com.au' },
  });

  return {
    name: 'stripe',

    async createCheckoutSession(input) {
      const session = await stripe.checkout.sessions.create(
        {
          mode: 'payment',
          currency: 'aud',
          customer_email: input.customerEmail ?? undefined,
          line_items: input.lineItems.map((li) => ({
            quantity: li.quantity,
            price_data: {
              currency: 'aud',
              unit_amount: li.amountCents,
              product_data: {
                name: li.name,
                description: li.description,
                images:
                  li.imageUrl && li.imageUrl.startsWith('https://') ? [li.imageUrl] : undefined,
              },
            },
          })),
          shipping_address_collection: { allowed_countries: ['AU'] },
          shipping_options: [
            {
              shipping_rate_data: {
                type: 'fixed_amount',
                display_name: input.shippingLabel,
                fixed_amount: { amount: input.shippingCents, currency: 'aud' },
              },
            },
          ],
          phone_number_collection: { enabled: true },
          payment_intent_data: {
            transfer_group: input.orderId,
            metadata: {
              order_id: input.orderId,
              order_number: input.orderNumber,
              returns_ack_at: input.returnsAckAt,
              returns_policy_version: input.returnsPolicyVersion,
            },
          },
          metadata: {
            order_id: input.orderId,
            order_number: input.orderNumber,
            cart_id: input.cartId,
            returns_ack_at: input.returnsAckAt,
            returns_policy_version: input.returnsPolicyVersion,
          },
          // Requires a Terms of service URL under Settings → Public details in the Stripe
          // Dashboard; the message below links buyers to our own terms page.
          consent_collection: { terms_of_service: 'required' },
          custom_text: {
            submit: { message: input.submitMessage },
            terms_of_service_acceptance: {
              message: `I agree to the [One Off terms](${input.termsUrl}), including the returns policy.`,
            },
          },
          client_reference_id: input.orderId,
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
        },
        { idempotencyKey: `checkout:${input.orderId}` },
      );
      if (!session.url) throw new Error('Stripe did not return a Checkout URL');
      return { id: session.id, url: session.url };
    },

    async retrieveCheckoutSession(id) {
      const s = await stripe.checkout.sessions.retrieve(id, {
        expand: ['payment_intent.latest_charge'],
      });
      const pi = typeof s.payment_intent === 'object' ? s.payment_intent : null;
      const charge = pi && typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
      const shipping = s.shipping_details ?? s.collected_information?.shipping_details ?? null;
      const info: CheckoutSessionInfo = {
        id: s.id,
        paymentStatus: s.payment_status,
        status: (s.status ?? 'open') as CheckoutSessionInfo['status'],
        amountTotal: s.amount_total ?? 0,
        currency: s.currency ?? 'aud',
        paymentIntentId: pi?.id ?? (typeof s.payment_intent === 'string' ? s.payment_intent : null),
        chargeId:
          charge?.id ?? (pi && typeof pi.latest_charge === 'string' ? pi.latest_charge : null),
        customerEmail: s.customer_details?.email ?? s.customer_email ?? null,
        customerName: s.customer_details?.name ?? shipping?.name ?? null,
        shippingAddress: shipping ? { name: shipping.name, ...shipping.address } : null,
        metadata: (s.metadata ?? {}) as Record<string, string>,
      };
      return info;
    },

    async createTransfer(input) {
      const t = await stripe.transfers.create(
        {
          amount: input.amountCents,
          currency: 'aud',
          destination: input.destination,
          transfer_group: input.transferGroup,
          source_transaction: input.sourceTransaction ?? undefined,
          metadata: input.metadata,
        },
        { idempotencyKey: input.idempotencyKey },
      );
      return { id: t.id };
    },

    async reverseTransfer(transferId, amountCents, idempotencyKey) {
      const r = await stripe.transfers.createReversal(
        transferId,
        { amount: amountCents },
        { idempotencyKey },
      );
      return { id: r.id };
    },

    async createRefund(input) {
      const r = await stripe.refunds.create(
        {
          payment_intent: input.paymentIntentId,
          amount: input.amountCents,
          metadata: input.metadata,
        },
        { idempotencyKey: input.idempotencyKey },
      );
      return { id: r.id, status: r.status ?? 'pending' };
    },

    async createExpressAccount(input) {
      const a = await stripe.accounts.create({
        type: 'express',
        country: 'AU',
        email: input.email,
        business_profile: {
          name: input.businessName,
          mcc: '5691',
          product_description: 'Independent fashion label',
        },
        capabilities: { transfers: { requested: true } },
        metadata: { maker_id: input.makerId },
      });
      return { id: a.id };
    },

    async createAccountLink(accountId, refreshUrl, returnUrl) {
      const link = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: 'account_onboarding',
      });
      return { url: link.url };
    },

    async createLoginLink(accountId) {
      const link = await stripe.accounts.createLoginLink(accountId);
      return { url: link.url };
    },

    async retrieveAccount(accountId) {
      const a = await stripe.accounts.retrieve(accountId);
      return {
        id: a.id,
        detailsSubmitted: a.details_submitted ?? false,
        chargesEnabled: a.charges_enabled ?? false,
        payoutsEnabled: a.payouts_enabled ?? false,
      };
    },

    constructEvent(rawBody, signature, secret) {
      return stripe.webhooks.constructEvent(rawBody, signature, secret);
    },
  };
}
