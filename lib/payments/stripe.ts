import Stripe from 'stripe';
import type { AccountInfo, CheckoutSessionInfo, PaymentIntentInfo, PaymentsDriver } from './types';

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
    appInfo: { name: 'off-one', url: 'https://shoponeoff.com.au' },
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
              message: `I agree to the [Off One terms](${input.termsUrl}), including the returns policy.`,
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

    async createPaymentIntent(input) {
      const pi = await stripe.paymentIntents.create(
        {
          amount: input.amountCents,
          currency: 'aud',
          automatic_payment_methods: { enabled: true },
          transfer_group: input.orderId,
          receipt_email: input.email ?? undefined,
          customer: input.customerId ?? undefined,
          setup_future_usage:
            input.customerId && input.savePaymentMethod ? 'on_session' : undefined,
          description: `Off One order ${input.orderNumber}`,
          metadata: { order_id: input.orderId, order_number: input.orderNumber },
        },
        { idempotencyKey: input.idempotencyKey },
      );
      return intentInfo(pi);
    },

    async updatePaymentIntent(id, input) {
      const pi = await stripe.paymentIntents.update(id, {
        amount: input.amountCents,
        receipt_email: input.email ?? undefined,
        ...(input.customerId ? { customer: input.customerId } : {}),
        setup_future_usage: input.customerId && input.savePaymentMethod ? 'on_session' : '',
        metadata: input.metadata,
      });
      return intentInfo(pi);
    },

    async retrievePaymentIntent(id) {
      return intentInfo(
        await stripe.paymentIntents.retrieve(id, { expand: ['latest_charge', 'payment_method'] }),
      );
    },

    async createCustomer(input) {
      const c = await stripe.customers.create(
        { email: input.email, name: input.name ?? undefined, metadata: { user_id: input.userId } },
        { idempotencyKey: `customer:${input.userId}` },
      );
      return { id: c.id };
    },

    async listCards(customerId) {
      const list = await stripe.paymentMethods.list({ customer: customerId, type: 'card' });
      return list.data.map((pm) => ({
        id: pm.id,
        brand: pm.card?.brand ?? 'card',
        last4: pm.card?.last4 ?? '••••',
        expMonth: pm.card?.exp_month ?? 0,
        expYear: pm.card?.exp_year ?? 0,
      }));
    },

    async detachPaymentMethod(paymentMethodId) {
      await stripe.paymentMethods.detach(paymentMethodId);
    },

    async createDepositSession(input) {
      const metadata = {
        kind: 'commission_deposit',
        commission_request_id: input.requestId,
        quote_id: input.quoteId,
      };
      const session = await stripe.checkout.sessions.create(
        {
          mode: 'payment',
          currency: 'aud',
          customer_email: input.customerEmail ?? undefined,
          // Keep the card on file so the balance can be charged when the piece is finished.
          customer_creation: 'always',
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: 'aud',
                unit_amount: input.amountCents,
                product_data: { name: input.title, description: input.description },
              },
            },
          ],
          payment_intent_data: {
            setup_future_usage: 'off_session',
            transfer_group: `commission:${input.requestId}`,
            metadata,
          },
          metadata,
          client_reference_id: input.requestId,
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
        },
        { idempotencyKey: `deposit:${input.quoteId}` },
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
        ...(input.payoutWeekday
          ? {
              settings: {
                payouts: {
                  schedule: {
                    interval: 'weekly',
                    weekly_anchor:
                      input.payoutWeekday as Stripe.AccountCreateParams.Settings.Payouts.Schedule.WeeklyAnchor,
                  },
                },
              },
            }
          : {}),
      });
      return { id: a.id };
    },

    async setWeeklyPayouts(accountId, weekday) {
      await stripe.accounts.update(accountId, {
        settings: {
          payouts: {
            schedule: {
              interval: 'weekly',
              weekly_anchor:
                weekday as Stripe.AccountUpdateParams.Settings.Payouts.Schedule.WeeklyAnchor,
            },
          },
        },
      });
    },

    async getChargeFee(chargeId) {
      const charge = await stripe.charges.retrieve(chargeId, { expand: ['balance_transaction'] });
      const bt = charge.balance_transaction;
      return bt && typeof bt === 'object' ? bt.fee : 0;
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
      return accountInfo(a);
    },

    constructEvent(rawBody, signature, secret) {
      return stripe.webhooks.constructEvent(rawBody, signature, secret);
    },
  };
}

function intentInfo(pi: Stripe.PaymentIntent): PaymentIntentInfo {
  const charge = pi.latest_charge;
  const method = pi.payment_method;
  return {
    id: pi.id,
    clientSecret: pi.client_secret,
    status: pi.status,
    amount: pi.amount,
    currency: pi.currency,
    chargeId: typeof charge === 'string' ? charge : (charge?.id ?? null),
    paymentMethodType:
      typeof method === 'object' && method ? method.type : (pi.payment_method_types[0] ?? null),
    customerId: typeof pi.customer === 'string' ? pi.customer : (pi.customer?.id ?? null),
    receiptEmail: pi.receipt_email,
    metadata: pi.metadata ?? {},
  };
}

/** Flattens a Stripe account into what Studio stores (also used by the account.updated webhook). */
export function accountInfo(a: Stripe.Account): AccountInfo {
  const bank = a.external_accounts?.data.find((x) => x.object === 'bank_account') as
    | Stripe.BankAccount
    | undefined;
  return {
    id: a.id,
    detailsSubmitted: a.details_submitted ?? false,
    chargesEnabled: a.charges_enabled ?? false,
    payoutsEnabled: a.payouts_enabled ?? false,
    bankName: bank?.bank_name ?? null,
    bankLast4: bank?.last4 ?? null,
    requirementsDue: (a.requirements?.currently_due?.length ?? 0) > 0,
  };
}
