import { audit } from '@/lib/audit';
import { sql } from '@/lib/db';
import { CUSTOM } from '@/lib/custom/config';
import { reportError } from '@/lib/log';
import { sendPushToUser } from '@/lib/push/send';
import { prefsFor } from './notifications';
import {
  notifyBuyerQuoteExpiring,
  notifyBuyerReplies,
  notifyMakerNewRequest,
} from './custom-notify';

export interface CustomTick {
  expiredRecipients: number;
  summariesSent: number;
  remindersSent: number;
  quotesExpired: number;
  expiryWarnings: number;
  requestsExpired: number;
  expiringPushes: number;
}

/**
 * The clock on custom requests, safe to run hourly or daily: makers who haven't replied in 48
 * hours are marked expired (and the buyer gets "n of m replied"), makers are reminded once after
 * 24 quiet hours, quotes expire after 7 days (with a warning the day before), and a request with
 * no replies at all closes.
 */
export async function customRequestsTick(now = new Date()): Promise<CustomTick> {
  const out: CustomTick = {
    expiredRecipients: 0,
    summariesSent: 0,
    remindersSent: 0,
    quotesExpired: 0,
    expiryWarnings: 0,
    requestsExpired: 0,
    expiringPushes: 0,
  };

  // 48 hours up: the maker's row expires and counts as no reply.
  const expired = await sql()<{ requestId: string; makerId: string }[]>`
    update public.custom_request_recipients x set status = 'expired'
    from public.custom_requests r
    where r.id = x.request_id and x.status = 'pending' and x.reply_by < ${now} and r.status in ('sent', 'quoted')
    returning x.request_id, x.maker_id`;
  out.expiredRecipients = expired.length;
  for (const requestId of new Set(expired.map((e) => e.requestId))) {
    const [left] = await sql()<{ pending: number; quoted: number }[]>`
      select count(*) filter (where status = 'pending')::int as pending,
        count(*) filter (where status in ('quoted', 'chosen'))::int as quoted
      from public.custom_request_recipients where request_id = ${requestId}`;
    if (left?.pending) continue;
    // Everyone has answered one way or another: the buyer hears how it went.
    await notifyBuyerReplies(requestId).catch((err) =>
      reportError(err, { requestId, where: 'replies summary' }),
    );
    out.summariesSent++;
    if (!left?.quoted) {
      await sql()`update public.custom_requests set status = 'expired' where id = ${requestId} and status = 'sent'`;
      out.requestsExpired++;
      await audit('custom_request.expired', { type: 'custom_request', id: requestId });
    }
  }

  // One reminder after CUSTOM.reminderHours with no reply, while there's still time.
  const remind = await sql()<{ requestId: string; makerId: string }[]>`
    update public.custom_request_recipients x set reminded_at = ${now}
    from public.custom_requests r
    where r.id = x.request_id and x.status = 'pending' and x.reminded_at is null and x.reply_by > ${now}
      and x.created_at < ${new Date(now.getTime() - CUSTOM.reminderHours * 3_600_000)} and r.status in ('sent', 'quoted')
    returning x.request_id, x.maker_id`;
  for (const r of remind) {
    await notifyMakerNewRequest(r.requestId, r.makerId, true).catch((err) =>
      reportError(err, { requestId: r.requestId, where: 'request reminder' }),
    );
    out.remindersSent++;
  }

  // Six hours left to reply: one push to the maker.
  const expiring = await sql()<
    { requestId: string; makerId: string; userId: string; piece: string }[]
  >`
    update public.custom_request_recipients x set expiring_pushed_at = ${now}
    from public.custom_requests r, public.makers m
    where r.id = x.request_id and m.id = x.maker_id and x.status = 'pending' and x.expiring_pushed_at is null
      and x.reply_by > ${now} and x.reply_by < ${new Date(now.getTime() + 6 * 3_600_000)} and r.status in ('sent', 'quoted')
    returning x.request_id, x.maker_id, m.user_id, r.kind as piece`;
  for (const e of expiring) {
    if (!(await prefsFor(e.userId)).message.push) continue;
    await sendPushToUser(e.userId, {
      title: 'Request expires in 6 hours',
      body: `Quote or pass on the ${e.piece.replace(/_/g, ' ')} before the buyer moves on.`,
      url: `/studio/inbox/requests/${e.requestId}`,
      tag: `custom-expiring-${e.requestId}`,
    }).catch((err) => reportError(err, { requestId: e.requestId, where: 'push:expiring' }));
    out.expiringPushes++;
  }

  // Quotes: a warning the day before, then expiry.
  const warn = await sql()<{ id: string }[]>`
    update public.custom_quotes q set expiry_warned_at = ${now}
    from public.custom_requests r
    where r.id = q.request_id and q.status = 'sent' and q.expiry_warned_at is null
      and q.valid_until - interval '1 day' <= ${now} and q.valid_until > ${now} and r.status in ('sent', 'quoted')
    returning q.id`;
  for (const q of warn) {
    await notifyBuyerQuoteExpiring(q.id).catch((err) =>
      reportError(err, { quoteId: q.id, where: 'quote expiry warning' }),
    );
    out.expiryWarnings++;
  }
  const dead = await sql()<{ id: string }[]>`
    update public.custom_quotes set status = 'expired' where status = 'sent' and valid_until < ${now} returning id`;
  out.quotesExpired = dead.length;

  return out;
}
