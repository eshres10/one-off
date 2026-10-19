import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, sql } from '@/lib/db';
import { RETURNS_POLICY_VERSION } from '@/lib/content/returns';
import { addToCart } from '@/lib/services/cart';
import {
  openCheckout,
  preparePayment,
  saveCheckoutDelivery,
  saveCheckoutDetails,
} from '@/lib/services/checkout';
import { TEST_ADDRESS, pickVariant } from './helpers';

afterAll(closeDb);

describe('returns acknowledgement at checkout', () => {
  it('records the policy the buyer agreed to when they pay', async () => {
    const { product, variantId } = await pickVariant((p) => p.productType === 'ready_to_ship', 2);
    const owner = { sessionId: randomUUID(), userId: null };
    await addToCart({ ...owner, productId: product.id, variantId, quantity: 1 });
    const { orderId } = await openCheckout(owner);
    await saveCheckoutDetails(owner, { email: 'ack@buyer.test', phone: '' });
    await saveCheckoutDelivery(owner, { address: TEST_ADDRESS, speeds: {} });
    const [before] = await sql()<{ returnsAckAt: Date | null }[]>`
      select returns_ack_at from public.orders where id = ${orderId}`;
    expect(before!.returnsAckAt).toBeNull();
    const started = Date.now();
    await preparePayment(owner);
    const [order] = await sql()<{ returnsAckAt: Date; returnsPolicyVersion: string }[]>`
      select returns_ack_at, returns_policy_version from public.orders where id = ${orderId}`;
    expect(order!.returnsPolicyVersion).toBe(RETURNS_POLICY_VERSION);
    expect(order!.returnsAckAt.getTime()).toBeGreaterThanOrEqual(started - 1000);
  });
});
