import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '@/lib/db';
import { env, resetEnvCache } from '@/lib/env';
import { mockStripe } from '@/lib/payments/mock';
import { addToCart } from '@/lib/services/cart';
import { createCheckout } from '@/lib/services/checkout';
import { POST as webhookPOST } from '@/app/api/webhooks/stripe/route';
import { pickVariant } from './helpers';

const vars = process.env as Record<string, string | undefined>;
const saved = { ...vars };

function setEnv(overrides: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete vars[k];
    else vars[k] = v;
  }
  resetEnvCache();
}

afterEach(() => {
  for (const k of Object.keys(vars)) if (!(k in saved)) delete vars[k];
  Object.assign(vars, saved);
  resetEnvCache();
});
afterAll(closeDb);

describe('preview mode (browse-only launch)', () => {
  beforeEach(() => setEnv({ PREVIEW_MODE: 'true' }));

  it('refuses to add to bag or create a checkout', async () => {
    const { product, variantId } = await pickVariant((p) => p.productType === 'ready_to_ship');
    const sessionId = randomUUID();
    await expect(
      addToCart({ sessionId, userId: null, productId: product.id, variantId, quantity: 1 }),
    ).rejects.toThrow(/Checkout opens at launch/);
    await expect(createCheckout({ sessionId, userId: null, email: 'x@y.test' })).rejects.toThrow(
      /Checkout opens at launch/,
    );
  });

  it('does not accept mock-signed webhooks', async () => {
    const event = mockStripe.event('checkout.session.completed', { id: 'cs_mock_preview' });
    const { payload, header } = mockStripe.signEvent(event);
    const res = await webhookPOST(
      new Request('http://test/api/webhooks/stripe', {
        method: 'POST',
        body: payload,
        headers: { 'stripe-signature': header },
      }),
    );
    expect(res.status).toBe(404);
  });
});

describe('production configuration guard', () => {
  const prod = { NODE_ENV: 'production', CI: undefined, NEXT_PHASE: undefined };

  it('refuses mock payments in production unless preview mode is on', () => {
    setEnv({ ...prod, SESSION_SECRET: 'a-real-production-secret-that-is-long-enough-123' });
    expect(() => env()).toThrow(/Refusing to run production/);
    setEnv({
      ...prod,
      PREVIEW_MODE: 'true',
      SESSION_SECRET: 'a-real-production-secret-that-is-long-enough-123',
    });
    expect(env().PREVIEW_MODE).toBe(true);
  });

  it('refuses local auth in production with the default session secret', () => {
    setEnv({ ...prod, PREVIEW_MODE: 'true', SESSION_SECRET: undefined });
    expect(() => env()).toThrow(/SESSION_SECRET/);
  });
});
