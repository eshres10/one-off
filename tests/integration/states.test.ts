import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, sql } from '@/lib/db';
import { EMPTY, parseDiscover } from '@/lib/discover/params';
import { countDiscover, relaxFilters } from '@/lib/queries/discover';
import { addToCart } from '@/lib/services/cart';
import { openCheckout } from '@/lib/services/checkout';
import { requestRestockAlert, sendRestockAlerts } from '@/lib/services/restock';
import { shopBuyable } from '@/lib/domain/shop';
import { pickVariant } from './helpers';

afterAll(closeDb);

describe('filters too narrow', () => {
  it('suggests the single filter whose removal shows the most pieces, and that link works', async () => {
    // Navy, size 10 and under A$120 (nothing is that cheap): nothing matches all three.
    const p = parseDiscover({ colour: 'navy', size: '10', max: '120' });
    expect(await countDiscover(p)).toBe(0);
    const relax = await relaxFilters(p);
    expect(relax.active).toBe(3);
    expect(relax.remove?.key).toBe('max');
    expect(relax.remove?.rest).toBe('navy size 10');
    expect(relax.remove).not.toBeNull();
    const url = new URL(relax.remove!.href, 'http://x');
    const without = parseDiscover(url.searchParams);
    expect(await countDiscover(without)).toBe(relax.remove!.count);
    // No other single removal beats it.
    for (const key of ['colour', 'size', 'max'] as const) {
      const alt = { ...p, [key]: key === 'max' ? null : [] };
      expect(await countDiscover(alt)).toBeLessThanOrEqual(relax.remove!.count);
    }
  });

  it('has nothing to suggest when no filters are on', async () => {
    expect((await relaxFilters(EMPTY)).active).toBe(0);
  });
});

describe('notify me when a size comes back', () => {
  it('creates one alert per person and size, and emails once when stock returns', async () => {
    const { variantId } = await pickVariant((p) => p.productType === 'ready_to_ship', 21);
    await sql()`update public.product_variants set stock_quantity = 0 where id = ${variantId}`;
    const email = `restock.${Date.now()}@buyer.test`;
    await requestRestockAlert({ variantId, userId: null, email });
    await requestRestockAlert({ variantId, userId: null, email: email.toUpperCase() });
    const [n] = await sql()<{ n: number }[]>`
      select count(*)::int as n from public.restock_alerts where variant_id = ${variantId} and lower(email) = ${email}`;
    expect(n!.n).toBe(1);

    // Nothing is sent while it's still sold out.
    await sendRestockAlerts();
    const sent = async () =>
      (
        await sql()<{ n: number }[]>`
          select count(*)::int as n from public.email_outbox where template = 'restock_alert' and to_email = ${email}`
      )[0]!.n;
    expect(await sent()).toBe(0);

    await sql()`update public.product_variants set stock_quantity = 3 where id = ${variantId}`;
    await sendRestockAlerts();
    await sendRestockAlerts();
    expect(await sent()).toBe(1);
  });

  it('refuses sizes that are in stock', async () => {
    const { variantId } = await pickVariant((p) => p.productType === 'ready_to_ship', 22);
    await expect(
      requestRestockAlert({ variantId, userId: null, email: 'x@buyer.test' }),
    ).rejects.toThrow(/in stock/);
  });
});

describe('a shop on holiday', () => {
  it('still takes orders by default, with the banner text', () => {
    const until = '2026-12-20';
    const open = shopBuyable({ shopStatus: 'holiday', chargesEnabled: true, holidayUntil: until });
    expect(open.ok).toBe(true);
    expect(open.ok && open.holiday?.message).toMatch(
      /On holiday until 20 Dec\. You can still order\. Pieces ship from 21 Dec/,
    );
    const paused = shopBuyable(
      { shopStatus: 'holiday', chargesEnabled: true, holidayUntil: until },
      'pause_orders',
    );
    expect(paused.ok).toBe(false);
    expect(!paused.ok && paused.message).toMatch(/Back 21 Dec/);
  });

  it('moves checkout dispatch and arrival past the holiday', async () => {
    const { product, variantId } = await pickVariant((p) => p.productType === 'ready_to_ship', 23);
    const [m] = await sql()<{ id: string; shopStatus: string; holidayUntil: Date | null }[]>`
      select id, shop_status, holiday_until from public.makers where id = ${product.maker.id}`;
    const now = new Date('2026-11-02T00:00:00Z');
    const until = '2026-11-20';
    await sql()`update public.makers set shop_status = 'holiday', holiday_until = ${until} where id = ${m!.id}`;
    try {
      const sessionId = randomUUID();
      await addToCart({ sessionId, userId: null, productId: product.id, variantId, quantity: 1 });
      const view = await openCheckout({ sessionId, userId: null, email: null }, now);
      const parcel = view.parcels.find((p) => p.makerId === m!.id)!;
      expect(parcel.holidayNote).toMatch(/On holiday until 20 Nov/);
      expect(new Date(parcel.options.standard.from).getTime()).toBeGreaterThan(
        new Date('2026-11-21T00:00:00Z').getTime(),
      );
    } finally {
      await sql()`update public.makers set shop_status = ${m!.shopStatus}, holiday_until = ${m!.holidayUntil}
        where id = ${m!.id}`;
    }
  });
});
