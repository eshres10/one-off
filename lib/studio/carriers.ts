/** How a maker sends an order, with tracking number checks and links. */
export const CARRIERS = {
  auspost: {
    label: 'Australia Post',
    pattern: /^[A-Z0-9]{10,40}$/i,
    hint: 'Australia Post tracking numbers are 10 to 40 letters and numbers.',
    track: (n: string) => `https://auspost.com.au/mypost/track/details/${encodeURIComponent(n)}`,
  },
  sendle: {
    label: 'Sendle',
    pattern: /^[A-Z0-9]{6,12}$/i,
    hint: 'Sendle references are 6 to 12 letters and numbers, like SNXV6R.',
    track: (n: string) => `https://track.sendle.com/tracking?ref=${encodeURIComponent(n)}`,
  },
  hand: {
    label: 'Hand delivered',
    pattern: null,
    hint: '',
    track: () => null,
  },
} as const;
export type Carrier = keyof typeof CARRIERS;

export function carrierLabel(c: string | null | undefined): string | null {
  if (!c) return null;
  return c in CARRIERS ? CARRIERS[c as Carrier].label : c;
}

export function trackingUrl(carrier: string | null, tracking: string | null): string | null {
  if (!carrier || !tracking || !(carrier in CARRIERS)) return null;
  return CARRIERS[carrier as Carrier].track(tracking);
}

/** Tracking number check for a carrier: an error message, or null when it's fine. */
export function trackingError(carrier: Carrier, tracking: string): string | null {
  const c = CARRIERS[carrier];
  if (!c.pattern) return null;
  const t = tracking.replace(/\s+/g, '');
  if (!t) return 'Add the tracking number so the buyer can follow it.';
  return c.pattern.test(t) ? null : c.hint;
}
