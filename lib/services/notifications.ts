import { randomBytes } from 'node:crypto';
import { sql, type Db } from '@/lib/db';
import { formatPrice } from '@/lib/domain/money';
import { env } from '@/lib/env';
import { sendEmail } from '@/lib/email/send';
import { emails } from '@/lib/email/templates';
import { sendSms, toE164 } from '@/lib/sms/send';
import { dayLabel, timeIn } from '@/lib/studio/format';

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

/**
 * What a buyer chose in Account → Notifications. Order and delivery emails are always sent, so
 * they aren't here. Delivery texts use the sms column; the rest use email.
 */
export const BUYER_NOTIFY = [
  'delivery_sms',
  'maker_messages',
  'following_weekly',
  'one_of_ones_in_size',
  'news',
] as const;
export type BuyerNotify = (typeof BUYER_NOTIFY)[number];

export const BUYER_DEFAULTS: Record<BuyerNotify, boolean> = {
  delivery_sms: true,
  maker_messages: true,
  following_weekly: true,
  one_of_ones_in_size: false,
  news: false,
};

export async function buyerPrefs(userId: string | null): Promise<Record<BuyerNotify, boolean>> {
  const prefs = { ...BUYER_DEFAULTS };
  if (!userId) return prefs;
  const rows = await sql()<{ event: BuyerNotify; email: boolean; sms: boolean }[]>`
    select event, email, sms from public.notification_prefs
    where user_id = ${userId} and event in ${sql()(BUYER_NOTIFY as unknown as string[])}`;
  for (const r of rows) prefs[r.event] = r.event === 'delivery_sms' ? r.sms : r.email;
  return prefs;
}

/** Saves the buyer's switches (through RLS: only their own rows). */
export async function saveBuyerPrefs(db: Db, userId: string, prefs: Record<BuyerNotify, boolean>) {
  for (const event of BUYER_NOTIFY) {
    const on = prefs[event];
    const sms = event === 'delivery_sms' ? on : false;
    const email = event === 'delivery_sms' ? true : on;
    await db`
      insert into public.notification_prefs (user_id, event, email, push, sms)
      values (${userId}, ${event}, ${email}, false, ${sms})
      on conflict (user_id, event) do update set email = excluded.email, sms = excluded.sms, updated_at = now()`;
  }
}

/** "Your order's on its way" by text, when the buyer left delivery texts on and gave a mobile. */
export async function textBuyerShipped(fulfilmentId: string) {
  const [o] = await sql()<
    { userId: string | null; phone: string | null; orderNumber: string; makerName: string }[]
  >`
    select o.buyer_user_id as user_id, o.buyer_phone as phone, o.order_number, m.display_name as maker_name
    from public.fulfilments f join public.orders o on o.id = f.order_id join public.makers m on m.id = f.maker_id
    where f.id = ${fulfilmentId}`;
  const to = toE164(o?.phone);
  if (!o || !to || !(await buyerPrefs(o.userId)).delivery_sms) return;
  await sendSms(
    to,
    `One Off: your piece from ${o.makerName} is on its way (order ${o.orderNumber}). Track it at ${env().APP_URL}/account/orders/${o.orderNumber}`,
    'buyer_shipped',
  );
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

/** Morning messages to makers go out at the first run at or after this local hour. */
export const MAKER_MORNING_HOUR = 8;

/**
 * Orders due to ship today, in each maker's own time zone: sent at the first run at or after
 * 8am local (the cron runs several times a morning to cover every Australian zone). Idempotent
 * per order through ship_by_reminded_at.
 */
export async function shipByReminders(now = new Date()) {
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
    from public.orders o, public.makers m
    where o.id = f.order_id and m.id = f.maker_id
      and f.estimated_dispatch_date = (${now}::timestamptz at time zone m.timezone)::date
      and extract(hour from ${now}::timestamptz at time zone m.timezone) >= ${MAKER_MORNING_HOUR}
      and f.ship_by_reminded_at is null
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

/** Mondays from 8am in each maker's time zone: the last 7 days. Once per shop per week. */
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
        and f.estimated_dispatch_date < (${now}::timestamptz at time zone m.timezone)::date)::int as overdue
    from public.makers m
    where m.shop_status in ('live', 'holiday') and m.user_id is not null
      and extract(isodow from ${now}::timestamptz at time zone m.timezone) = 1
      and extract(hour from ${now}::timestamptz at time zone m.timezone) >= ${MAKER_MORNING_HOUR}
      and not exists (select 1 from public.email_outbox e where e.template = 'maker_weekly_summary'
        and e.related_entity_id = m.id::text and e.created_at > ${now}::timestamptz - interval '6 days')`;
  let sent = 0;
  for (const w of shops) {
    const shop = await shopContact(w.makerId);
    if (!shop?.email || !(await prefsFor(shop.userId)).weekly_summary.email) continue;
    await sendEmail(emails.weeklySummary(shop.email, { ...w, shop: shop.shop }));
    sent++;
  }
  return { sent };
}

/**
 * Makers with a problem report due today (their time) hear about it from 8am local, once per
 * case, with the due time in their own zone.
 */
export async function caseDueReminders(now = new Date()) {
  const due = await sql()<
    {
      id: string;
      makerId: string;
      caseNumber: string | null;
      productTitle: string;
      respondBy: Date;
      timezone: string;
    }[]
  >`
    update public.return_claims c set maker_reminded_at = ${now}
    from public.makers m, public.order_items oi
    where m.id = c.seller_id and oi.id = c.order_item_id and c.status = 'open' and c.maker_reminded_at is null
      and (c.respond_by at time zone m.timezone)::date = (${now}::timestamptz at time zone m.timezone)::date
      and extract(hour from ${now}::timestamptz at time zone m.timezone) >= ${MAKER_MORNING_HOUR}
      and c.respond_by > ${now}
    returning c.id, c.seller_id as maker_id, c.case_number, oi.product_title, c.respond_by, m.timezone`;
  let sent = 0;
  for (const c of due) {
    const shop = await shopContact(c.makerId);
    if (!shop?.email) continue;
    await sendEmail(
      emails.caseDueReminder(shop.email, {
        id: c.id,
        caseNumber: c.caseNumber,
        productTitle: c.productTitle,
        dueAt: timeIn(c.respondBy, c.timezone),
      }),
    );
    sent++;
  }
  return { due: due.length, sent };
}
