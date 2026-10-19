import { sql } from '@/lib/db';

export class RateLimitError extends Error {
  constructor(message = 'You’re doing that a bit too often. Please wait a moment and try again.') {
    super(message);
    this.name = 'RateLimitError';
  }
}

export const LIMITS = {
  message: { windowSeconds: 60, max: 8 },
  messageHourly: { windowSeconds: 3600, max: 60 },
  review: { windowSeconds: 3600, max: 10 },
  commission: { windowSeconds: 86_400, max: 5 },
  auth: { windowSeconds: 300, max: 10 },
  checkout: { windowSeconds: 60, max: 10 },
  upload: { windowSeconds: 300, max: 30 },
  claim: { windowSeconds: 86_400, max: 10 },
  supportRequest: { windowSeconds: 3600, max: 5 },
  clientEvent: { windowSeconds: 3600, max: 300 },
  restoreLink: { windowSeconds: 3600, max: 20 },
  pushSubscribe: { windowSeconds: 3600, max: 20 },
  returnStart: { windowSeconds: 86_400, max: 10 },
  question: { windowSeconds: 3600, max: 10 },
  waitlist: { windowSeconds: 3600, max: 10 },
  clientError: { windowSeconds: 300, max: 20 },
} as const;

/** Throws RateLimitError when `key` has exceeded the limit for the current window. */
export async function rateLimit(bucket: keyof typeof LIMITS, subject: string): Promise<void> {
  const { windowSeconds, max } = LIMITS[bucket];
  const [row] = await sql()<{ allowed: boolean }[]>`
    select public.hit_rate_limit(${`${bucket}:${subject}`}, ${windowSeconds}, ${max}) as allowed`;
  if (!row?.allowed) throw new RateLimitError();
}
