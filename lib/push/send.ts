import webpush from 'web-push';
import { sql } from '@/lib/db';
import { env } from '@/lib/env';
import { reportError } from '@/lib/log';
import { SITE } from '@/lib/site/config';

export interface PushPayload {
  title: string;
  body: string;
  /** Opened when the notification is tapped (same-origin path). */
  url: string;
  /** Notifications with the same tag replace each other. */
  tag?: string;
}

export interface PushTarget {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

type Sender = (
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  body: string,
) => Promise<unknown>;

export type SendResult = 'sent' | 'skipped' | 'disabled' | 'failed' | 'not configured';

/** web-push with the VAPID keys from env, or null when they aren't set. */
function defaultSender(): Sender | null {
  const e = env();
  if (!e.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !e.VAPID_PRIVATE_KEY) return null;
  return (sub, body) =>
    webpush.sendNotification(sub, body, {
      vapidDetails: {
        subject: e.VAPID_SUBJECT,
        publicKey: e.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
        privateKey: e.VAPID_PRIVATE_KEY!,
      },
      TTL: 60 * 60 * 24,
    });
}

/**
 * Sends one push to one browser, at most once per SITE.pushAlerts.minHoursBetween: the row is
 * claimed (last_sent_at moved to now) before sending, so two jobs can't both send. A 404 or 410
 * means the browser dropped the subscription, so it's disabled; any other failure gives the
 * claim back. `send` is injectable for tests.
 */
export async function sendPush(
  target: PushTarget,
  payload: PushPayload,
  opts: { now?: Date; send?: Sender } = {},
): Promise<SendResult> {
  const send = opts.send ?? defaultSender();
  if (!send) return 'not configured';
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - SITE.pushAlerts.minHoursBetween * 3_600_000);
  const [claimed] = await sql()<{ previous: Date | null }[]>`
    update public.push_subscriptions s set last_sent_at = ${now}
    from (select id, last_sent_at as previous from public.push_subscriptions where id = ${target.id} for update) p
    where s.id = p.id and s.disabled_at is null and (p.previous is null or p.previous <= ${since})
    returning p.previous`;
  if (!claimed) return 'skipped';
  try {
    await send(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(payload),
    );
    return 'sent';
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      await sql()`update public.push_subscriptions set disabled_at = ${now} where id = ${target.id}`;
      return 'disabled';
    }
    await sql()`
      update public.push_subscriptions set last_sent_at = ${claimed.previous}
      where id = ${target.id} and last_sent_at = ${now}`;
    reportError(err, { where: 'push:send', status });
    return 'failed';
  }
}

/** Every active browser a person has turned drop alerts on in. */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
  opts: { now?: Date; send?: Sender } = {},
): Promise<SendResult[]> {
  const subs = await sql()<PushTarget[]>`
    select id, endpoint, p256dh, auth from public.push_subscriptions
    where user_id = ${userId} and disabled_at is null`;
  const out: SendResult[] = [];
  for (const s of subs) out.push(await sendPush(s, payload, opts));
  return out;
}
