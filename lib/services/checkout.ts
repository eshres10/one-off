import { sql, type Db } from '@/lib/db';
import { env } from '@/lib/env';
import { audit } from '@/lib/audit';
import { assertCheckoutEnabled } from '@/lib/features';
import { estimateDelivery, toIsoDate } from '@/lib/domain/leadTime';
import { splitOrder } from '@/lib/domain/split';
import { randomBytes } from 'node:crypto';
import { sanitizeText } from '@/lib/domain/moderation';
import { payments } from '@/lib/payments';
import { TERMS, commissionPctAt } from '@/lib/studio/terms';
import { RETURNS_POLICY_VERSION, RETURNS_STRIPE_SUBMIT } from '@/lib/content/returns';
import { CartError, getCart, shippingMap } from './cart';

export interface CheckoutResult {
  orderId: string;
  url: string;
}

/**
 * Creates a pending buyer order (one per cart) with one fulfilment record per maker, then a
 * Stripe Checkout Session for the full amount including shipping. Prices, stock and totals are
 * always recomputed from the database — never trusted from the client. The order only becomes
 * `paid` when the verified webhook arrives.
 */
export async function createCheckout(input: {
  sessionId: string;
  userId: string | null;
  email: string | null;
  /** The buyer ticked "I understand One Off pieces can't be returned for change of mind." */
  returnsAck: boolean;
  /** Optional note the maker includes with the piece. */
  giftNote?: string | null;
}): Promise<CheckoutResult> {
  assertCheckoutEnabled();
  if (!input.returnsAck)
    throw new CartError('Please confirm you understand the returns policy before checking out.');
  const e = env();
  const cart = await getCart(input.sessionId);
  if (!cart.cartId || cart.lines.length === 0) throw new CartError('Your bag is empty.');
  if (cart.hasProblems)
    throw new CartError('Some pieces in your bag are no longer available. Please review your bag.');

  const makerRows = await sql()<
    {
      makerId: string;
      shippingStandardCents: number;
      freeShippingOverCents: number | null;
      dispatchDays: number;
      foundingUntil: Date | null;
    }[]
  >`
    select id as maker_id, shipping_standard_cents, free_shipping_over_cents, dispatch_days, founding_until
    from public.makers where id in ${sql()(Array.from(new Set(cart.lines.map((l) => l.makerId))))}`;
  const shipping = shippingMap(makerRows);
  const now = new Date();
  // The commission rate is fixed at the time of sale: founding makers pay the founding rate.
  const foundingUntil = new Map(makerRows.map((m) => [m.makerId, m.foundingUntil]));
  const standardBps = e.PLATFORM_FEE_BPS;
  const plan = splitOrder(cart.lines, shipping, (makerId) => {
    const pct = commissionPctAt(foundingUntil.get(makerId), now);
    return pct === TERMS.standardCommissionPct ? standardBps : Math.round(pct * 100);
  });
  const giftNote = sanitizeText(input.giftNote ?? '').slice(0, 300) || null;
  const returnsAckAt = now.toISOString();

  const orderId = await sql().begin(async (tx) => {
    const db = tx as unknown as Db;
    const [numbered] = await db<
      { orderNumber: string }[]
    >`select public.next_order_number() as order_number`;
    const orderNumber = numbered!.orderNumber;
    const [order] = await db<{ id: string }[]>`
      insert into public.orders (order_number, buyer_user_id, buyer_email, status, subtotal_cents, shipping_total_cents,
        total_cents, platform_fee_total_cents, returns_ack_at, returns_policy_version, gift_note)
      values (${orderNumber}, ${input.userId}, ${input.email ?? 'pending@checkout.invalid'}, 'pending', ${plan.subtotalCents},
        ${plan.shippingTotalCents}, ${plan.totalCents}, ${plan.platformFeeTotalCents}, ${returnsAckAt},
        ${RETURNS_POLICY_VERSION}, ${giftNote})
      returning id`;
    for (const f of plan.fulfilments) {
      const dispatchDays = shipping.get(f.makerId)!.dispatchDays;
      const latest = f.items
        .map((i) =>
          estimateDelivery(
            { productType: i.productType, leadTimeDays: i.leadTimeDays, dispatchDays },
            now,
          ),
        )
        .reduce((a, b) => (b.deliveryTo > a.deliveryTo ? b : a));
      const [ful] = await db<{ id: string }[]>`
        insert into public.fulfilments (order_id, maker_id, status, subtotal_cents, shipping_cents, platform_commission_cents,
          seller_net_cents, estimated_dispatch_date, estimated_delivery_from, estimated_delivery_to, commission_pct_applied,
          shipping_method, reply_token)
        values (${order!.id}, ${f.makerId}, 'paid', ${f.subtotalCents}, ${f.shippingCents}, ${f.platformCommissionCents},
          ${f.sellerNetCents}, ${toIsoDate(latest.dispatchBy)}, ${toIsoDate(latest.deliveryFrom)}, ${toIsoDate(latest.deliveryTo)},
          ${f.feeBps / 100}, ${f.shippingCents === 0 ? 'Free tracked shipping' : 'Standard tracked'},
          ${randomBytes(12).toString('base64url')})
        returning id`;
      for (const item of f.items) {
        await db`
          insert into public.order_items (order_id, fulfilment_id, product_id, variant_id, maker_id, product_title, variant_label,
            product_type, image_url, quantity, unit_price_cents, line_total_cents, platform_commission_cents, seller_net_cents,
            custom_measurements)
          values (${order!.id}, ${ful!.id}, ${item.productId}, ${item.variantId}, ${item.makerId}, ${item.productTitle},
            ${item.variantLabel}, ${item.productType}, ${item.imageUrl ?? null}, ${item.quantity}, ${item.unitPriceCents},
            ${item.lineTotalCents}, ${item.platformCommissionCents}, ${item.sellerNetCents},
            (select custom_measurements from public.cart_items where cart_id = ${cart.cartId} and variant_id = ${item.variantId} limit 1))`;
      }
    }
    return { id: order!.id, orderNumber };
  });

  const makerCount = plan.fulfilments.length;
  const session = await payments().createCheckoutSession({
    orderId: orderId.id,
    orderNumber: orderId.orderNumber,
    cartId: cart.cartId,
    lineItems: cart.lines.map((l) => ({
      name: l.productTitle,
      description: `${l.variantLabel} · Made by ${l.makerName}`,
      amountCents: l.unitPriceCents,
      quantity: l.quantity,
      imageUrl: l.imageUrl?.startsWith('http')
        ? l.imageUrl
        : l.imageUrl
          ? `${e.APP_URL}${l.imageUrl}`
          : null,
    })),
    shippingCents: plan.shippingTotalCents,
    shippingLabel:
      makerCount > 1
        ? `Tracked shipping from ${makerCount} makers`
        : 'Tracked shipping (Australia Post)',
    customerEmail: input.email,
    successUrl: `${e.APP_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${e.APP_URL}/bag?cancelled=1`,
    returnsAckAt,
    returnsPolicyVersion: RETURNS_POLICY_VERSION,
    submitMessage: RETURNS_STRIPE_SUBMIT,
    termsUrl: `${e.APP_URL}/terms`,
  });
  await sql()`update public.orders set stripe_checkout_session_id = ${session.id} where id = ${orderId.id}`;
  await audit(
    'checkout.created',
    { type: 'order', id: orderId.id },
    { total: plan.totalCents, makers: makerCount },
    input.userId,
  );
  return { orderId: orderId.id, url: session.url.replace('%7BCHECKOUT_SESSION_ID%7D', session.id) };
}
