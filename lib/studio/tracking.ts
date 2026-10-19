import { env } from '@/lib/env';
import { log } from '@/lib/log';

/** A delivery the carrier has confirmed, or null if it hasn't arrived (or we can't tell). */
export type DeliveryCheck = { deliveredAt: Date } | null;

/**
 * Australia Post Shipping & Tracking API (needs AUSPOST_API_KEY, AUSPOST_API_PASSWORD and
 * AUSPOST_ACCOUNT_NUMBER). Untested against the live API: check the response shape with your
 * account before relying on it; without keys, orders are marked delivered after a timeout.
 */
async function auspost(tracking: string): Promise<DeliveryCheck> {
  const e = env();
  if (!e.AUSPOST_API_KEY || !e.AUSPOST_API_PASSWORD || !e.AUSPOST_ACCOUNT_NUMBER) return null;
  const res = await fetch(
    `https://digitalapi.auspost.com.au/shipping/v1/track?tracking_ids=${encodeURIComponent(tracking)}`,
    {
      headers: {
        'account-number': e.AUSPOST_ACCOUNT_NUMBER,
        Authorization: `Basic ${Buffer.from(`${e.AUSPOST_API_KEY}:${e.AUSPOST_API_PASSWORD}`).toString('base64')}`,
        Accept: 'application/json',
      },
    },
  );
  if (!res.ok) throw new Error(`AusPost tracking ${res.status}`);
  const body = (await res.json()) as {
    tracking_results?: Array<{
      status?: string;
      trackable_items?: Array<{ events?: Array<{ date?: string; description?: string }> }>;
    }>;
  };
  const r = body.tracking_results?.[0];
  if (!r || !/delivered/i.test(r.status ?? '')) return null;
  const event = r.trackable_items?.[0]?.events?.find((ev) =>
    /delivered/i.test(ev.description ?? ''),
  );
  return { deliveredAt: event?.date ? new Date(event.date) : new Date() };
}

/** Sendle tracking (needs SENDLE_ID and SENDLE_API_KEY). Same caveat as Australia Post. */
async function sendle(tracking: string): Promise<DeliveryCheck> {
  const e = env();
  if (!e.SENDLE_ID || !e.SENDLE_API_KEY) return null;
  const res = await fetch(`https://api.sendle.com/api/tracking/${encodeURIComponent(tracking)}`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${e.SENDLE_ID}:${e.SENDLE_API_KEY}`).toString('base64')}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Sendle tracking ${res.status}`);
  const body = (await res.json()) as {
    state?: string;
    tracking_events?: Array<{ event_type?: string; scan_time?: string }>;
  };
  const event = body.tracking_events?.find((ev) => ev.event_type === 'Delivered');
  if (body.state !== 'Delivered' && !event) return null;
  return { deliveredAt: event?.scan_time ? new Date(event.scan_time) : new Date() };
}

export function trackingConfigured(carrier: string): boolean {
  const e = env();
  if (carrier === 'auspost') return Boolean(e.AUSPOST_API_KEY && e.AUSPOST_ACCOUNT_NUMBER);
  if (carrier === 'sendle') return Boolean(e.SENDLE_ID && e.SENDLE_API_KEY);
  return false;
}

export async function checkDelivery(carrier: string, tracking: string): Promise<DeliveryCheck> {
  try {
    if (carrier === 'auspost') return await auspost(tracking);
    if (carrier === 'sendle') return await sendle(tracking);
  } catch (err) {
    log.warn({ err, carrier }, 'tracking lookup failed');
  }
  return null;
}
