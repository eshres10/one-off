import { sql } from '@/lib/db';
import { formatPrice } from '@/lib/domain/money';
import { sendEmail } from '@/lib/email/send';
import { emails } from '@/lib/email/templates';

export const NOTIFY_EVENTS = [
  'new_order',
  'ship_by_reminder',
  'message',
  'low_stock',
  'payout_sent',
  'weekly_summary',
] as const;
export type NotifyEvent = (typeof NOTIFY_EVENTS)[number];

export interface Channels {
  email: boolean;
  push: boolean;
  sms: boolean;
}

/** New orders by email + push + SMS; messages by email + push; everything else by email. */
export const DEFAULT_PREFS: Record<NotifyEvent, Channels> = {
  new_order: { email: true, push: true, sms: true },
  ship_by_reminder: { email: true, push: false, sms: false },
  message: { email: true, push: true, sms: false },
  low_stock: { email: true, push: false, sms: false },
  payout_sent: { email: true, push: false, sms: false },
  weekly_summary: { email: true, push: false, sms: false },
};

export async function prefsFor(userId: string | null): Promise<Record<NotifyEvent, Channels>> {
  const prefs = structuredClone(DEFAULT_PREFS);
  if (!userId) return prefs;
  const rows = await sql()<({ event: NotifyEvent } & Channels)[]>`
    select event, email, push, sms from public.notification_prefs where user_id = ${userId}`;
  for (const r of rows) prefs[r.event] = { email: r.email, push: r.push, sms: r.sms };
  return prefs;
}

export async function notifyPayoutSent(
  makerId: string,
  amountCents: number,
  maker: { email: string | null; bankName: string | null; bankLast4: string | null },
) {
  const [owner] = await sql()<{ userId: string | null }[]>`
    select user_id from public.makers where id = ${makerId}`;
  const prefs = await prefsFor(owner?.userId ?? null);
  if (!maker.email || !prefs.payout_sent.email) return;
  await sendEmail(
    emails.payoutSent(
      maker.email,
      makerId,
      formatPrice(amountCents),
      maker.bankName,
      maker.bankLast4,
    ),
  );
}
