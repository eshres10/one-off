import type Stripe from 'stripe';

export interface CheckoutLineItem {
  name: string;
  description?: string;
  amountCents: number;
  quantity: number;
  imageUrl?: string | null;
}

export interface CreateCheckoutInput {
  orderId: string;
  orderNumber: string;
  cartId: string;
  lineItems: CheckoutLineItem[];
  shippingCents: number;
  shippingLabel: string;
  customerEmail?: string | null;
  successUrl: string;
  cancelUrl: string;
  /** The buyer ticked the returns acknowledgement in the bag (ISO timestamp). */
  returnsAckAt: string;
  returnsPolicyVersion: string;
  /** Shown above Checkout's pay button. */
  submitMessage: string;
  termsUrl: string;
}

export interface CheckoutSessionInfo {
  id: string;
  paymentStatus: 'paid' | 'unpaid' | 'no_payment_required';
  status: 'open' | 'complete' | 'expired';
  amountTotal: number;
  currency: string;
  paymentIntentId: string | null;
  chargeId: string | null;
  customerEmail: string | null;
  customerName: string | null;
  shippingAddress: Record<string, unknown> | null;
  metadata: Record<string, string>;
}

/** A PaymentIntent as checkout needs it. */
export interface PaymentIntentInfo {
  id: string;
  clientSecret: string | null;
  status:
    | 'requires_payment_method'
    | 'requires_confirmation'
    | 'requires_action'
    | 'processing'
    | 'requires_capture'
    | 'canceled'
    | 'succeeded';
  amount: number;
  currency: string;
  chargeId: string | null;
  /** card, afterpay_clearpay, … (what the buyer actually paid with). */
  paymentMethodType: string | null;
  customerId: string | null;
  receiptEmail: string | null;
  metadata: Record<string, string>;
}

export interface SavedCard {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

export interface AccountInfo {
  id: string;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  /** The payout bank account, for "Connected ✓ {bank} ••{last4}". */
  bankName: string | null;
  bankLast4: string | null;
  /** Stripe still needs information before payouts or charges are enabled. */
  requirementsDue: boolean;
}

export interface PaymentsDriver {
  readonly name: 'stripe' | 'mock';
  createCheckoutSession(input: CreateCheckoutInput): Promise<{ id: string; url: string }>;
  retrieveCheckoutSession(id: string): Promise<CheckoutSessionInfo>;
  /**
   * The order's one PaymentIntent on the platform account (separate charges and transfers):
   * transfer_group = order id, so each maker's transfer links back to it. Methods come from
   * the Stripe Dashboard (automatic payment methods), so only enabled ones are offered.
   */
  createPaymentIntent(input: {
    orderId: string;
    orderNumber: string;
    amountCents: number;
    email: string | null;
    customerId: string | null;
    /** Keep the card on the buyer's Stripe Customer for next time. */
    savePaymentMethod: boolean;
    idempotencyKey: string;
  }): Promise<PaymentIntentInfo>;
  updatePaymentIntent(
    id: string,
    input: {
      amountCents: number;
      email: string | null;
      customerId: string | null;
      savePaymentMethod: boolean;
      metadata: Record<string, string>;
    },
  ): Promise<PaymentIntentInfo>;
  retrievePaymentIntent(id: string): Promise<PaymentIntentInfo>;
  createCustomer(input: { email: string; name: string | null; userId: string }): Promise<{
    id: string;
  }>;
  listCards(customerId: string): Promise<SavedCard[]>;
  detachPaymentMethod(paymentMethodId: string): Promise<void>;
  createTransfer(input: {
    amountCents: number;
    destination: string;
    transferGroup: string;
    sourceTransaction: string | null;
    metadata: Record<string, string>;
    idempotencyKey: string;
  }): Promise<{ id: string }>;
  reverseTransfer(
    transferId: string,
    amountCents: number,
    idempotencyKey: string,
  ): Promise<{ id: string }>;
  createRefund(input: {
    paymentIntentId: string;
    amountCents: number;
    metadata: Record<string, string>;
    idempotencyKey: string;
  }): Promise<{ id: string; status: string }>;
  createExpressAccount(input: {
    email: string;
    makerId: string;
    businessName: string;
    /** Weekly payout day (TERMS.payoutWeekday). */
    payoutWeekday?: string;
  }): Promise<{ id: string }>;
  createAccountLink(
    accountId: string,
    refreshUrl: string,
    returnUrl: string,
  ): Promise<{ url: string }>;
  createLoginLink(accountId: string): Promise<{ url: string }>;
  /** Weekly payouts on the maker's chosen weekday. */
  setWeeklyPayouts(accountId: string, weekday: string): Promise<void>;
  /** Stripe's actual processing fee on a charge, in cents. */
  getChargeFee(chargeId: string): Promise<number>;
  retrieveAccount(accountId: string): Promise<AccountInfo>;
  /** Verifies a webhook signature and parses the event. Throws on invalid signature. */
  constructEvent(rawBody: string, signature: string, secret: string): Stripe.Event;
}
