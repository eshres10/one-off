import { randomBytes } from 'node:crypto';
import { sql } from '@/lib/db';
import { formatPrice } from '@/lib/domain/money';
import { env } from '@/lib/env';
import { sendEmail } from '@/lib/email/send';
import { emails } from '@/lib/email/templates';
import { sendSms, toE164 } from '@/lib/sms/send';
import { dayLabel, melbourneToday } from '@/lib/studio/format';

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

interface ShopContact {
  makerId: string;
  shop: string;
  email: string | null;
  mobile: string | null;
  userId: string | null;
}

async function shopContact(makerId: string): Promise<ShopContact | null> {
  const [m] = await sql()<ShopContact[]>`
    select m.id as maker_id, m.display_name as shop, coalesce(u.email, m.invite_email) as email, m.mobile,
           m.user_id
    from public.makers m left join public.users u on u.id = m.user_id
    where m.id = ${makerId}`;
  return m ?? null;
}

/** The address a maker can reply to with a tracking number (when inbound email is set up). */
export function replyAddress(token: string): string | null {
  const domain = env().INBOUND_EMAIL_DOMAIN;
  return domain ? `orders+${token}@${domain}` : null;
}

/** A short link to the order panel, used in texts: /o/<token>. */
export const shortOrderLink = (token: string) => `${env().APP_URL}/o/${token}`;

async function ensureReplyToken(fulfilmentId: string): Promise<string> {
  const token = randomBytes(6).toString('base64url');
  const [row] = await sql()<{ replyToken: string }[]>`
    update public.fulfilments set reply_token = coalesce(reply_token, ${token})
    where id = ${fulfilmentId} returning reply_token`;
  return row!.replyToken;
}

const addressLine = (a: Record<string, string> | null) =>
  a
    ? [a.name, a.line1, a.line2, `${a.city ?? ''} ${a.state ?? ''} ${a.postal_code ?? ''}`.trim()]
        .filter(Boolean)
        .join('\n')
    : '—';

/** "You made a sale": email (with ship-by, what they get and the reply-to line) and SMS. */
export async function notifyNewOrder(fulfilmentId: string) {
  const [f] = await sql()<
    {
      makerId: string;
      orderId: string;
      orderNumber: string;
      shipBy: string | null;
      shippingCents: number;
      sellerNetCents: number;
      giftNote: string | null;
      address: Record<string, string> | null;
    }[]
  >`
    select f.maker_id, o.id as order_id, o.order_number, to_char(f.estimated_dispatch_date, 'YYYY-MM-DD') as ship_by,
           f.shipping_cents, f.seller_net_cents, o.gift_note, o.shipping_address as address
    from public.fulfilments f join public.orders o on o.id = f.order_id
    where f.id = ${fulfilmentId}`;
  if (!f) return;
  const items = await sql()<{ title: string; variant: string; quantity: number }[]>`
    select product_title as title, variant_label as variant, quantity from public.order_items
    where fulfilment_id = ${fulfilmentId} and fulfilment_status <> 'refunded' order by created_at`;
  const shop = await shopContact(f.makerId);
  if (!shop || items.length === 0) return;
  const prefs = await prefsFor(shop.userId);
  const token = await ensureReplyToken(fulfilmentId);
  const shipBy = f.shipBy ? dayLabel(f.shipBy) : 'soon';

  if (shop.email && prefs.new_order.email) {
    await sendEmail(
      emails.makerNewOrder(shop.email, {
        orderId: f.orderId,
        orderNumber: f.orderNumber,
        fulfilmentId,
        shipBy,
        items,
        shippingCents: f.shippingCents,
        giftNote: f.giftNote,
        shipTo: addressLine(f.address),
        youGetCents: f.sellerNetCents,
        replyTo: replyAddress(token),
      }),
    );
  }
  const to = toE164(shop.mobile);
  if (to && prefs.new_order.sms && env().SMS_ENABLED) {
    const first = items[0]!;
    const where = [f.address?.city, f.address?.state].filter(Boolean).join(' ');
    await sendSms(
      to,
      `One Off: You made a sale! ${first.title}, size ${first.variant}${where ? `, to ${where}` : ''}. Ship by ${shipBy}. Add tracking: ${shortOrderLink(token)}`,
      'new_order',
    );
  }
}

/** Daily at 8am Melbourne: orders due to ship today that haven't. Idempotent per order. */
export async function shipByReminders(now = new Date()) {
  const today = melbourneToday(0, now);
  const due = await sql()<
    {
      id: string;
      makerId: string;
      orderId: string;
      orderNumber: string;
      piece: string;
      buyer: string | null;
    }[]
  >`
    update public.fulfilments f set ship_by_reminded_at = now()
    from public.orders o
    where o.id = f.order_id and f.estimated_dispatch_date = ${today}::date and f.ship_by_reminded_at is null
      and f.status in ('paid', 'preparing', 'making', 'ready')
    returning f.id, f.maker_id, o.id as order_id, o.order_number,
      (select product_title from public.order_items oi where oi.fulfilment_id = f.id order by created_at limit 1) as piece,
      o.buyer_name as buyer`;
  let sent = 0;
  for (const d of due) {
    const shop = await shopContact(d.makerId);
    if (!shop?.email || !(await prefsFor(shop.userId)).ship_by_reminder.email) continue;
    await sendEmail(
      emails.makerShipByReminder(shop.email, {
        orderId: d.orderId,
        orderNumber: d.orderNumber,
        fulfilmentId: d.id,
        piece: d.piece,
        buyer: d.buyer?.split(' ')[0] || 'Your buyer',
      }),
    );
    sent++;
  }
  return { due: due.length, sent };
}

/** After a sale: a size that dropped to its last one (ready-to-ship pieces only). */
export async function notifyLowStock(variantIds: string[]) {
  if (variantIds.length === 0) return;
  const low = await sql()<{ makerId: string; productId: string; title: string; variant: string }[]>`
    select p.maker_id, p.id as product_id, p.title,
           coalesce(nullif(concat_ws(' · ', v.size, v.colour), ''), 'one size') as variant
    from public.product_variants v join public.products p on p.id = v.product_id
    where v.id = any(${variantIds}::uuid[]) and v.stock_quantity = 1 and p.product_type = 'ready_to_ship'`;
  for (const l of low) {
    const shop = await shopContact(l.makerId);
    if (!shop?.email || !(await prefsFor(shop.userId)).low_stock.email) continue;
    await sendEmail(emails.lowStock(shop.email, l));
  }
}

/** Mondays at 8am Melbourne: the last 7 days for every open shop. Once per shop per week. */
export async function weeklySummaries(now = new Date()) {
  const shops = await sql()<
    {
      makerId: string;
      salesCents: number;
      orders: number;
      views: number;
      saves: number;
      topPiece: string | null;
      overdue: number;
    }[]
  >`
    select m.id as maker_id,
      coalesce((select sum(f.subtotal_cents) from public.fulfilments f join public.orders o on o.id = f.order_id
        where f.maker_id = m.id and o.paid_at > ${now}::timestamptz - interval '7 days'), 0)::int as sales_cents,
      (select count(*) from public.fulfilments f join public.orders o on o.id = f.order_id
        where f.maker_id = m.id and o.paid_at > ${now}::timestamptz - interval '7 days')::int as orders,
      (select count(*) from public.product_views v where v.maker_id = m.id
        and v.created_at > ${now}::timestamptz - interval '7 days')::int as views,
      (select count(*) from public.saved_items s join public.products p on p.id = s.product_id
        where p.maker_id = m.id and s.created_at > ${now}::timestamptz - interval '7 days')::int as saves,
      (select p.title from public.product_views v join public.products p on p.id = v.product_id
        where v.maker_id = m.id and v.created_at > ${now}::timestamptz - interval '7 days'
        group by p.id, p.title order by count(*) desc limit 1) as top_piece,
      (select count(*) from public.fulfilments f where f.maker_id = m.id
        and f.status in ('paid', 'preparing', 'making', 'ready')
        and f.estimated_dispatch_date < ${melbourneToday(0, now)}::date)::int as overdue
    from public.makers m
    where m.shop_status in ('live', 'holiday') and m.user_id is not null
      and not exists (select 1 from public.email_outbox e where e.template = 'maker_weekly_summary'
        and e.related_entity_id = m.id and e.created_at > ${now}::timestamptz - interval '6 days')`;
  let sent = 0;
  for (const w of shops) {
    const shop = await shopContact(w.makerId);
    if (!shop?.email || !(await prefsFor(shop.userId)).weekly_summary.email) continue;
    await sendEmail(emails.weeklySummary(shop.email, { ...w, shop: shop.shop }));
    sent++;
  }
  return { sent };
}
