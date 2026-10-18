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

export interface AccountInfo {
  id: string;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
}

export interface PaymentsDriver {
  readonly name: 'stripe' | 'mock';
  createCheckoutSession(input: CreateCheckoutInput): Promise<{ id: string; url: string }>;
  retrieveCheckoutSession(id: string): Promise<CheckoutSessionInfo>;
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
  }): Promise<{ id: string }>;
  createAccountLink(
    accountId: string,
    refreshUrl: string,
    returnUrl: string,
  ): Promise<{ url: string }>;
  createLoginLink(accountId: string): Promise<{ url: string }>;
  retrieveAccount(accountId: string): Promise<AccountInfo>;
  /** Verifies a webhook signature and parses the event. Throws on invalid signature. */
  constructEvent(rawBody: string, signature: string, secret: string): Stripe.Event;
}
