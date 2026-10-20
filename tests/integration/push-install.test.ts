import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, sql } from '@/lib/db';
import { sendPush, type PushTarget } from '@/lib/push/send';
import {
  removePushSubscription,
  savePushSubscription,
  sendDropAlerts,
  sendOrderShippedPush,
} from '@/lib/services/push';
import { createRestoreToken, redeemRestoreToken } from '@/lib/services/restore';
import { SITE } from '@/lib/site/config';
import { MAKERS, PRODUCTS, buyer } from './helpers';

const alerts = SITE.pushAlerts as { enabled: boolean };
const wasEnabled = alerts.enabled;
beforeAll(() => {
  alerts.enabled = true;
});
afterAll(async () => {
  alerts.enabled = wasEnabled;
  await closeDb();
});

const HOUR = 3_600_000;
const endpoint = () => `https://fcm.googleapis.com/fcm/send/test-${randomUUID()}`;

async function subscribe(userId: string | null, ep = endpoint()): Promise<PushTarget> {
  await savePushSubscription({ userId, endpoint: ep, p256dh: 'p256', auth: 'auth' });
  const [row] = await sql()<PushTarget[]>`
    select id, endpoint, p256dh, auth from public.push_subscriptions where endpoint = ${ep}`;
  return row!;
}

/** A fake push service that records what it was asked to send. */
function recorder(fail?: { statusCode: number }) {
  const sent: Array<{ endpoint: string; payload: Record<string, string> }> = [];
  const send = async (sub: { endpoint: string }, body: string) => {
    if (fail) throw Object.assign(new Error('push failed'), fail);
    sent.push({ endpoint: sub.endpoint, payload: JSON.parse(body) });
  };
  return { sent, send };
}

const payload = { title: 'Off One', body: 'Hello', url: '/' };

describe('push subscriptions (test 10)', () => {
  it('subscribing twice from one browser keeps one row, and keeps the owner', async () => {
    const ep = endpoint();
    const user = buyer(0).id;
    await savePushSubscription({ userId: user, endpoint: ep, p256dh: 'a', auth: 'a' });
    await savePushSubscription({ userId: null, endpoint: ep, p256dh: 'b', auth: 'b' });
    const rows = await sql()<{ userId: string | null; p256dh: string }[]>`
      select user_id, p256dh from public.push_subscriptions where endpoint = ${ep}`;
    expect(rows).toEqual([{ userId: user, p256dh: 'b' }]);
    await removePushSubscription(ep);
    expect(
      await sql()`select 1 from public.push_subscriptions where endpoint = ${ep}`,
    ).toHaveLength(0);
  });

  it('a second send within 24 hours is skipped', async () => {
    const sub = await subscribe(null);
    const r = recorder();
    const now = new Date();
    expect(await sendPush(sub, payload, { now, send: r.send })).toBe('sent');
    expect(
      await sendPush(sub, payload, { now: new Date(now.getTime() + 23 * HOUR), send: r.send }),
    ).toBe('skipped');
    expect(
      await sendPush(sub, payload, { now: new Date(now.getTime() + 24 * HOUR), send: r.send }),
    ).toBe('sent');
    expect(r.sent).toHaveLength(2);
  });

  it('two jobs sending at once only send one', async () => {
    const sub = await subscribe(null);
    const r = recorder();
    const now = new Date();
    const results = await Promise.all([
      sendPush(sub, payload, { now, send: r.send }),
      sendPush(sub, payload, { now, send: r.send }),
    ]);
    expect(results.sort()).toEqual(['sent', 'skipped']);
  });

  it('a 410 (or 404) disables the subscription', async () => {
    for (const statusCode of [410, 404]) {
      const sub = await subscribe(null);
      expect(await sendPush(sub, payload, { send: recorder({ statusCode }).send })).toBe(
        'disabled',
      );
      const [row] = await sql()<{ disabledAt: Date | null }[]>`
        select disabled_at from public.push_subscriptions where id = ${sub.id}`;
      expect(row!.disabledAt).not.toBeNull();
      expect(
        await sendPush(sub, payload, {
          now: new Date(Date.now() + 48 * HOUR),
          send: recorder().send,
        }),
      ).toBe('skipped');
    }
  });

  it('any other failure gives the day back, so the next try can send', async () => {
    const sub = await subscribe(null);
    expect(await sendPush(sub, payload, { send: recorder({ statusCode: 500 }).send })).toBe(
      'failed',
    );
    expect(await sendPush(sub, payload, { send: recorder().send })).toBe('sent');
  });
});

describe('drop alert triggers', () => {
  it('a followed maker’s new piece: one push naming it, opening the product', async () => {
    const user = buyer(1).id;
    const maker = MAKERS[0]!;
    const product = PRODUCTS.find((p) => p.maker.id === maker.id)!;
    const at = new Date('2031-03-01T22:00:00Z');
    const [prev] = await sql()<{ publishedAt: Date | null; status: string }[]>`
      select published_at, status from public.products where id = ${product.id}`;
    await sql()`insert into public.maker_follows (user_id, maker_id) values (${user}, ${maker.id}) on conflict do nothing`;
    await sql()`update public.products set published_at = ${new Date(at.getTime() - HOUR)}, status = 'approved' where id = ${product.id}`;
    const sub = await subscribe(user);
    try {
      const r = recorder();
      const out = await sendDropAlerts(at, { send: r.send });
      expect(out).toMatchObject({ users: 1, sent: 1 });
      const mine = r.sent.filter((s) => s.endpoint === sub.endpoint);
      expect(mine).toHaveLength(1);
      expect(mine[0]!.payload).toMatchObject({
        body: `New from ${maker.displayName}: ${product.title}`,
        url: `/products/${product.slug}`,
      });
      // The next day's run doesn't repeat it (published more than a day before).
      const later = await sendDropAlerts(new Date(at.getTime() + 25 * HOUR), { send: r.send });
      expect(later).toMatchObject({ users: 0 });
    } finally {
      await sql()`update public.products set published_at = ${prev!.publishedAt}, status = ${prev!.status} where id = ${product.id}`;
      await removePushSubscription(sub.endpoint);
    }
  });

  it('is off behind the feature flag', async () => {
    alerts.enabled = false;
    try {
      expect(await sendDropAlerts(new Date())).toBe('off');
      expect(await sendOrderShippedPush(randomUUID())).toBe('off');
    } finally {
      alerts.enabled = true;
    }
  });

  it('order shipped: "Your order is on its way", opening the order', async () => {
    const [order] = await sql()<{ id: string; buyerUserId: string }[]>`
      select id, buyer_user_id from public.orders where buyer_user_id is not null limit 1`;
    expect(order).toBeTruthy();
    const sub = await subscribe(order!.buyerUserId);
    // Clear any earlier sends to this person's other test browsers.
    await sql()`update public.push_subscriptions set last_sent_at = null where user_id = ${order!.buyerUserId}`;
    const r = recorder();
    try {
      await sendOrderShippedPush(order!.id, { send: r.send });
      const mine = r.sent.find((s) => s.endpoint === sub.endpoint);
      expect(mine?.payload).toMatchObject({
        body: 'Your order is on its way',
        url: `/account/orders/${order!.id}`,
      });
    } finally {
      await removePushSubscription(sub.endpoint);
    }
  });
});

describe('restore link for guests (test 7)', () => {
  it('brings the bag and saved pieces back once, within 24 hours', async () => {
    const cart = randomUUID();
    const saved = [PRODUCTS[0]!.id, PRODUCTS[1]!.id];
    const token = await createRestoreToken({
      cartSessionId: cart,
      savedProductIds: [...saved, 'not-a-uuid'],
    });
    expect(token).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(await redeemRestoreToken(token)).toEqual({
      cartSessionId: cart,
      savedProductIds: saved,
    });
    expect(await redeemRestoreToken(token)).toBeNull();
  });

  it('expires after 24 hours, and only the hash is stored', async () => {
    const now = new Date();
    const token = await createRestoreToken({ cartSessionId: null, savedProductIds: [], now });
    expect(
      await sql()`select 1 from public.restore_tokens where token_hash = ${token}`,
    ).toHaveLength(0);
    expect(await redeemRestoreToken(token, new Date(now.getTime() + 24 * HOUR + 1000))).toBeNull();
    expect(await redeemRestoreToken('short')).toBeNull();
  });
});
