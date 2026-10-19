import { sql } from '@/lib/db';
import { sendPushToUser, type PushPayload, type SendResult } from '@/lib/push/send';
import { SITE } from '@/lib/site/config';

/**
 * Push services the browser is allowed to register. The server POSTs to the endpoint when it
 * sends, so anything else (an internal address, say) is refused.
 */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /(^|\.)push\.apple\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)notify\.windows\.com$/,
];

export function isPushEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && PUSH_HOSTS.some((h) => h.test(u.hostname));
  } catch {
    return false;
  }
}

/** One row per browser: subscribing again updates the keys and turns it back on. */
export async function savePushSubscription(input: {
  userId: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
}): Promise<void> {
  await sql()`
    insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
    values (${input.userId}, ${input.endpoint}, ${input.p256dh}, ${input.auth})
    on conflict (endpoint) do update set
      user_id = coalesce(excluded.user_id, public.push_subscriptions.user_id),
      p256dh = excluded.p256dh, auth = excluded.auth, disabled_at = null`;
}

/** The "Drop alerts" switch turned off (or the browser unsubscribed). */
export async function removePushSubscription(endpoint: string): Promise<void> {
  await sql()`delete from public.push_subscriptions where endpoint = ${endpoint}`;
}

/** "New from Halde Studio: Butter silk slip", or the batched line for several pieces. */
export function dropAlertPayload(
  pieces: Array<{ maker: string; title: string; slug: string }>,
): PushPayload {
  if (pieces.length === 1) {
    const p = pieces[0]!;
    return {
      title: 'One Off',
      body: `New from ${p.maker}: ${p.title}`,
      url: `/products/${p.slug}`,
      tag: 'drop',
    };
  }
  return {
    title: 'One Off',
    body: `${pieces.length} new pieces from makers you follow`,
    url: '/?tab=following',
    tag: 'drop',
  };
}

/**
 * The daily drop alert: for everyone with drop alerts on, the pieces published in the last day
 * by makers they follow, as one push. sendPush keeps it to one a day per browser.
 */
export async function sendDropAlerts(
  now: Date,
  opts: Parameters<typeof sendPushToUser>[2] = {},
): Promise<{ users: number; sent: number } | 'off'> {
  if (!SITE.pushAlerts.enabled) return 'off';
  const since = new Date(now.getTime() - 86_400_000);
  const rows = await sql()<{ userId: string; maker: string; title: string; slug: string }[]>`
    select f.user_id, m.display_name as maker, p.title, p.slug
    from public.maker_follows f
    join public.makers m on m.id = f.maker_id and m.status = 'approved'
    join public.products p on p.maker_id = m.id and p.status = 'approved'
    where p.published_at > ${since} and p.published_at <= ${now}
      and exists (select 1 from public.push_subscriptions s where s.user_id = f.user_id and s.disabled_at is null)
    order by f.user_id, p.published_at desc`;
  const byUser = new Map<string, Array<{ maker: string; title: string; slug: string }>>();
  for (const r of rows) byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), r]);
  let sent = 0;
  for (const [userId, pieces] of byUser) {
    const results = await sendPushToUser(userId, dropAlertPayload(pieces), { now, ...opts });
    sent += results.filter((r) => r === 'sent').length;
  }
  return { users: byUser.size, sent };
}

/** "Your order is on its way", opening the order. */
export async function sendOrderShippedPush(
  orderId: string,
  opts: Parameters<typeof sendPushToUser>[2] = {},
): Promise<SendResult[] | 'off'> {
  if (!SITE.pushAlerts.enabled) return 'off';
  const [o] = await sql()<{ buyerUserId: string | null }[]>`
    select buyer_user_id from public.orders where id = ${orderId}`;
  if (!o?.buyerUserId) return [];
  return sendPushToUser(
    o.buyerUserId,
    {
      title: 'One Off',
      body: 'Your order is on its way',
      url: `/account/orders/${orderId}`,
      tag: `order-${orderId}`,
    },
    opts,
  );
}
