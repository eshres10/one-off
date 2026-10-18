import { randomUUID } from 'node:crypto';
import { sql } from '@/lib/db';
import { mockStripe } from '@/lib/payments/mock';
import { handleStripeEvent } from '@/lib/services/webhook';
import { addToCart } from '@/lib/services/cart';
import { createCheckout } from '@/lib/services/checkout';
import type { Role } from '@/lib/db';
import { ADMIN, BUYERS, MAKERS, PRODUCTS } from '../../scripts/seed-data';

export { ADMIN, BUYERS, MAKERS, PRODUCTS };

export function buyer(i = 0) {
  const b = BUYERS[i]!;
  return { id: b.id, email: b.email, role: 'buyer' as Role, displayName: b.name, makerId: null };
}

export function seller(i = 0) {
  const m = MAKERS[i]!;
  return {
    id: m.userId,
    email: m.email,
    role: 'seller' as Role,
    displayName: m.displayName,
    makerId: m.id,
  };
}

/** First in-stock variant of a seeded product matching the predicate. */
export async function pickVariant(predicate: (p: (typeof PRODUCTS)[number]) => boolean, skip = 0) {
  const candidates = PRODUCTS.filter(predicate);
  for (const p of candidates.slice(skip)) {
    const [v] = await sql()<{ id: string; stockQuantity: number }[]>`
      select id, stock_quantity from public.product_variants where product_id = ${p.id} and is_active and stock_quantity >= 2
      order by sort_order limit 1`;
    if (v) return { product: p, variantId: v.id, stock: v.stockQuantity };
  }
  throw new Error('No in-stock variant found');
}

/** Builds a cart, creates the Stripe (mock) checkout, pays it and delivers the signed webhook. */
export async function buyAndPay(
  lines: Array<{ productId: string; variantId: string; quantity?: number }>,
  email = 'integration@buyer.test',
  userId: string | null = null,
) {
  const sessionId = randomUUID();
  for (const l of lines)
    await addToCart({
      sessionId,
      userId,
      productId: l.productId,
      variantId: l.variantId,
      quantity: l.quantity ?? 1,
    });
  const { orderId } = await createCheckout({ sessionId, userId, email, returnsAck: true });
  const [order] = await sql()<
    { stripeCheckoutSessionId: string }[]
  >`select stripe_checkout_session_id from public.orders where id = ${orderId}`;
  const csId = order!.stripeCheckoutSessionId;
  await mockStripe.markSessionPaid(csId, {
    email,
    name: 'Integration Buyer',
    address: { line1: '1 Test St', city: 'Fitzroy', state: 'VIC', postal_code: '3065' },
  });
  const event = mockStripe.event('checkout.session.completed', {
    id: csId,
    object: 'checkout.session',
  });
  const outcome = await handleStripeEvent(event as never);
  return { orderId, sessionId, csId, event, outcome };
}
