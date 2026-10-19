import { sql } from '@/lib/db';
import { sendEmail } from '@/lib/email/send';
import { emails } from '@/lib/email/templates';
import { log } from '@/lib/log';
import { CARRIERS, type Carrier } from '@/lib/studio/carriers';
import { markShipped } from './studio-orders';
import { UserError } from './errors';

/** The reply text above the quoted original and any signature. */
export function replyBody(text: string): string {
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*>/.test(line)) break;
    if (/^On .+wrote:\s*$/i.test(line.trim())) break;
    if (/^-{2,}\s*$/.test(line.trim()) || /^-+ ?Original Message/i.test(line.trim())) break;
    if (/^From: /i.test(line.trim())) break;
    out.push(line);
  }
  return out.join('\n');
}

/**
 * Finds a tracking number in a maker's reply. Sendle when they say so (or it's short),
 * Australia Post otherwise. Numbers need a digit; all-digit ones need 12+ so phone numbers
 * in a signature aren't mistaken for tracking.
 */
export function findTracking(text: string): { carrier: Carrier; tracking: string } | null {
  const body = replyBody(text);
  const saysSendle = /\bsendle\b/i.test(body);
  const tokens = body.toUpperCase().match(/\b[A-Z0-9]{6,40}\b/g) ?? [];
  for (const t of tokens) {
    if (!/\d/.test(t)) continue;
    if (/^\d+$/.test(t) && t.length < 12) continue;
    if (/^OO\d+$/.test(t)) continue;
    const carrier: Carrier =
      saysSendle && CARRIERS.sendle.pattern.test(t)
        ? 'sendle'
        : t.length >= 10
          ? 'auspost'
          : 'sendle';
    if (CARRIERS[carrier].pattern.test(t)) return { carrier, tracking: t };
  }
  return null;
}

/** The token in orders+<token>@domain, from any of the To addresses. */
export function tokenFrom(to: string): string | null {
  return to.match(/orders\+([A-Za-z0-9_-]{6,32})@/)?.[1] ?? null;
}

const bareEmail = (from: string) => (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();

export type InboundResult = 'shipped' | 'no_tracking' | 'unknown_order' | 'not_owner' | 'already';

/** A maker's reply to a new-order email: when it has a tracking number, mark the order shipped. */
export async function handleInboundReply(msg: {
  to: string;
  from: string;
  text: string;
}): Promise<InboundResult> {
  const token = tokenFrom(msg.to);
  if (!token) return 'unknown_order';
  const [f] = await sql()<
    {
      id: string;
      status: string;
      orderId: string;
      orderNumber: string;
      userId: string | null;
      role: 'buyer' | 'seller' | 'admin';
      makerId: string;
      email: string | null;
    }[]
  >`
    select f.id, f.status, o.id as order_id, o.order_number, u.id as user_id, u.role, f.maker_id, u.email
    from public.fulfilments f join public.orders o on o.id = f.order_id
    join public.makers m on m.id = f.maker_id left join public.users u on u.id = m.user_id
    where f.reply_token = ${token}`;
  if (!f || !f.userId || !f.email) return 'unknown_order';
  // Only the shop's own address can mark its orders shipped.
  if (bareEmail(msg.from) !== f.email.toLowerCase()) {
    log.warn({ fulfilmentId: f.id }, 'inbound reply from another address');
    return 'not_owner';
  }
  if (!['paid', 'preparing', 'making', 'ready'].includes(f.status)) return 'already';

  const found = findTracking(msg.text);
  if (!found) {
    await sendEmail(
      emails.trackingNotFound(f.email, { orderNumber: f.orderNumber, fulfilmentId: f.id }),
    );
    return 'no_tracking';
  }
  try {
    await markShipped(
      { id: f.userId, role: f.role, makerId: f.makerId },
      { fulfilmentId: f.id, carrier: found.carrier, trackingNumber: found.tracking },
    );
  } catch (err) {
    if (err instanceof UserError) {
      await sendEmail(
        emails.trackingNotFound(f.email, { orderNumber: f.orderNumber, fulfilmentId: f.id }),
      );
      return 'no_tracking';
    }
    throw err;
  }
  await sendEmail(
    emails.trackingReceived(f.email, {
      orderId: f.orderId,
      orderNumber: f.orderNumber,
      fulfilmentId: f.id,
      carrier: CARRIERS[found.carrier].label,
      tracking: found.tracking,
    }),
  );
  return 'shipped';
}
