import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, sql } from '@/lib/db';
import { RETURNS_POLICY_VERSION } from '@/lib/content/returns';
import { payments } from '@/lib/payments';
import { addToCart } from '@/lib/services/cart';
import { createCheckout } from '@/lib/services/checkout';
import { pickVariant } from './helpers';

afterAll(closeDb);

describe('returns acknowledgement at checkout', () => {
  it('refuses to start checkout until the buyer acknowledges the returns policy', async () => {
    const { product, variantId } = await pickVariant((p) => p.productType === 'ready_to_ship', 2);
    const sessionId = randomUUID();
    await addToCart({ sessionId, userId: null, productId: product.id, variantId, quantity: 1 });
    await expect(
      createCheckout({ sessionId, userId: null, email: 'noack@buyer.test', returnsAck: false }),
    ).rejects.toThrow(/returns policy/);
    const [row] = await sql()<{ count: number }[]>`
      select count(*)::int as count from public.orders where buyer_email = 'noack@buyer.test'`;
    expect(row!.count).toBe(0);
  });

  it('records the acknowledgement on the order and in the Stripe session metadata', async () => {
    const { product, variantId } = await pickVariant((p) => p.productType === 'ready_to_ship', 2);
    const sessionId = randomUUID();
    await addToCart({ sessionId, userId: null, productId: product.id, variantId, quantity: 1 });
    const before = Date.now();
    const { orderId } = await createCheckout({
      sessionId,
      userId: null,
      email: 'ack@buyer.test',
      returnsAck: true,
    });
    const [order] = await sql()<
      { returnsAckAt: Date; returnsPolicyVersion: string; stripeCheckoutSessionId: string }[]
    >`select returns_ack_at, returns_policy_version, stripe_checkout_session_id from public.orders where id = ${orderId}`;
    expect(order!.returnsPolicyVersion).toBe(RETURNS_POLICY_VERSION);
    expect(order!.returnsAckAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    const session = await payments().retrieveCheckoutSession(order!.stripeCheckoutSessionId);
    expect(session.metadata.returns_policy_version).toBe(RETURNS_POLICY_VERSION);
    expect(session.metadata.returns_ack_at).toBe(order!.returnsAckAt.toISOString());
  });
});
