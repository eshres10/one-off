import { audit } from '@/lib/audit';
import { sql, withUser, type Db } from '@/lib/db';
import { formatPrice } from '@/lib/domain/money';
import { blockedMessage, moderateMessage, sanitizeText } from '@/lib/domain/moderation';
import { emails } from '@/lib/email/templates';
import { buyerPrefs, prefsFor } from './notifications';
import { sendEmail } from '@/lib/email/send';
import { env } from '@/lib/env';
import { rateLimit } from '@/lib/rate-limit';
import type { SessionUser } from '@/lib/auth/session';
import type { ProductType } from '@/lib/domain/types';
import { UserError } from './errors';
import { variantLabel } from './cart';

/**
 * Product-level conversations (like Depop): every thread is about exactly one piece, one custom
 * request, or (rarely) a general question to a maker. `message_threads` is the conversations
 * table; unread counters, "needs reply" and the 6-hour reply window live on the thread.
 */

export class ModerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModerationError';
  }
}

/** A maker should answer within this many hours of a buyer's message. */
export const REPLY_WINDOW_HOURS = 6;

export interface ThreadContext {
  productId?: string;
  productTitle?: string;
  productSlug?: string;
  imageUrl?: string | null;
  priceCents?: number;
  productType?: string;
  variantId?: string | null;
  variantLabel?: string | null;
  leadTimeDays?: number | null;
  commissionGarment?: string;
  /** Set when the buyer messages from an order: the maker sees which order it's about. */
  orderNumber?: string;
  orderId?: string;
}

export interface QuoteSnapshot {
  price_cents: number;
  deposit_pct: number;
  weeks: number;
  note: string | null;
  quote_id: string;
}

type Actor = Pick<SessionUser, 'id' | 'role' | 'displayName' | 'email' | 'makerId'>;

// ---------------------------------------------------------------------------
// Opening conversations
// ---------------------------------------------------------------------------

async function productContext(productId: string, variantId?: string) {
  const [product] = await sql()<
    {
      id: string;
      makerId: string;
      makerUserId: string;
      title: string;
      slug: string;
      priceCents: number;
      productType: string;
      leadTimeDays: number | null;
      imageUrl: string | null;
      colourCount: number;
    }[]
  >`
    select p.id, p.maker_id, m.user_id as maker_user_id, p.title, p.slug, p.price_cents, p.product_type, p.lead_time_days,
           cardinality(p.colours) as colour_count,
           (select public_url from public.product_images i where i.product_id = p.id order by sort_order limit 1) as image_url
    from public.products p join public.makers m on m.id = p.maker_id
    where p.id = ${productId} and p.status = 'approved' and m.status = 'approved'`;
  if (!product) throw new UserError('This piece is no longer available.');
  let label: string | null = null;
  let vid: string | null = null;
  if (variantId) {
    const [v] = await sql()<{ id: string; size: string; colour: string | null }[]>`
      select id, size, colour from public.product_variants where id = ${variantId} and product_id = ${product.id}`;
    if (v) {
      label = variantLabel(v.size, v.colour, product.colourCount);
      vid = v.id;
    }
  }
  const context: ThreadContext = {
    productId: product.id,
    productTitle: product.title,
    productSlug: product.slug,
    imageUrl: product.imageUrl,
    priceCents: product.priceCents,
    productType: product.productType,
    variantId: vid,
    variantLabel: label,
    leadTimeDays: product.leadTimeDays,
  };
  return { product, context };
}

/**
 * Finds or creates the buyer's conversation about a piece, without sending anything — "Ask the
 * maker" goes straight into the thread. Empty threads stay out of both inboxes.
 */
export async function openProductThread(
  buyer: Actor,
  input: { productId: string; variantId?: string },
): Promise<string> {
  const { product, context } = await productContext(input.productId, input.variantId);
  if (product.makerUserId === buyer.id) throw new UserError('You can’t message yourself.');
  return withUser(buyer, async (db) => {
    const [existing] = await db<{ id: string }[]>`
      select id from public.message_threads
      where buyer_user_id = ${buyer.id} and maker_id = ${product.makerId} and product_id = ${product.id} and commission_request_id is null`;
    if (existing) {
      await db`update public.message_threads set context = ${db.json(context as never)} where id = ${existing.id}`;
      return existing.id;
    }
    const [created] = await db<{ id: string }[]>`
      insert into public.message_threads (buyer_user_id, maker_id, product_id, context, kind)
      values (${buyer.id}, ${product.makerId}, ${product.id}, ${db.json(context as never)}, 'enquiry') returning id`;
    return created!.id;
  });
}

/** Opens (or reuses) the product conversation and sends the first message. */
export async function startProductThread(
  buyer: Actor,
  input: { productId: string; variantId?: string; body: string; imageUrls: string[] },
): Promise<string> {
  checkMessage(input.body, 'buyer');
  const threadId = await openProductThread(buyer, input);
  await sendMessage(buyer, { threadId, body: input.body, imageUrls: input.imageUrls });
  return threadId;
}

/**
 * "Message {maker}" on an order: the conversation about the first piece in that parcel, with the
 * order attached so the maker knows which purchase it's about.
 */
export async function openOrderThread(
  buyer: Pick<SessionUser, 'id' | 'role'>,
  fulfilmentId: string,
): Promise<string> {
  return withUser(buyer, async (db) => {
    const [f] = await db<
      {
        makerId: string;
        orderId: string;
        orderNumber: string;
        productId: string | null;
        productTitle: string;
        productSlug: string | null;
        imageUrl: string | null;
        priceCents: number;
        productType: string;
        variantLabel: string;
      }[]
    >`
      select f.maker_id, o.id as order_id, o.order_number, oi.product_id, oi.product_title, p.slug as product_slug,
        oi.image_url, oi.unit_price_cents as price_cents, oi.product_type, oi.variant_label
      from public.fulfilments f join public.orders o on o.id = f.order_id
      join lateral (select * from public.order_items i where i.fulfilment_id = f.id order by i.created_at limit 1) oi on true
      left join public.products p on p.id = oi.product_id
      where f.id = ${fulfilmentId} and o.buyer_user_id = ${buyer.id}`;
    if (!f) throw new UserError('We couldn’t find that order.');
    const context: ThreadContext = {
      productId: f.productId ?? undefined,
      productTitle: f.productTitle,
      productSlug: f.productSlug ?? undefined,
      imageUrl: f.imageUrl,
      priceCents: f.priceCents,
      productType: f.productType,
      variantLabel: f.variantLabel,
      orderNumber: f.orderNumber,
      orderId: f.orderId,
    };
    const [existing] = await db<{ id: string }[]>`
      select id from public.message_threads
      where buyer_user_id = ${buyer.id} and maker_id = ${f.makerId} and commission_request_id is null
        and ${f.productId ? db`product_id = ${f.productId}` : db`product_id is null`}
      order by created_at limit 1`;
    if (existing) {
      await db`update public.message_threads set context = ${db.json(context as never)} where id = ${existing.id}`;
      return existing.id;
    }
    const [created] = await db<{ id: string }[]>`
      insert into public.message_threads (buyer_user_id, maker_id, product_id, context, kind)
      values (${buyer.id}, ${f.makerId}, ${f.productId}, ${db.json(context as never)}, 'enquiry') returning id`;
    return created!.id;
  });
}

/** General question to a maker (no specific piece): "Ask a question" on the maker profile. */
export async function openMakerThread(buyer: Actor, makerId: string): Promise<string> {
  const [maker] = await sql()<{ id: string; userId: string }[]>`
    select id, user_id from public.makers where id = ${makerId} and status = 'approved'`;
  if (!maker) throw new UserError('This maker isn’t available.');
  if (maker.userId === buyer.id) throw new UserError('You can’t message yourself.');
  return withUser(buyer, async (db) => {
    const [existing] = await db<{ id: string }[]>`
      select id from public.message_threads
      where buyer_user_id = ${buyer.id} and maker_id = ${maker.id} and product_id is null and commission_request_id is null`;
    if (existing) return existing.id;
    const [created] = await db<{ id: string }[]>`
      insert into public.message_threads (buyer_user_id, maker_id, context) values (${buyer.id}, ${maker.id}, '{}'::jsonb) returning id`;
    return created!.id;
  });
}

export async function startMakerThread(
  buyer: Actor,
  input: { makerId: string; body: string; imageUrls: string[] },
): Promise<string> {
  checkMessage(input.body, 'buyer');
  const threadId = await openMakerThread(buyer, input.makerId);
  await sendMessage(buyer, { threadId, body: input.body, imageUrls: input.imageUrls });
  return threadId;
}

/**
 * The conversation for a custom request (created with the request, or when the concierge team
 * assigns a maker). Opens with a system summary of what was asked for.
 */
export async function ensureCommissionThread(requestId: string): Promise<string | null> {
  const [req] = await sql()<
    {
      id: string;
      buyerUserId: string;
      makerId: string | null;
      garmentType: string;
      occasion: string | null;
      budgetMinCents: number;
      budgetMaxCents: number;
      deadlineDate: Date | null;
      notes: string | null;
      sourceProductId: string | null;
    }[]
  >`
    select id, buyer_user_id, maker_id, garment_type, occasion, budget_min_cents, budget_max_cents, deadline_date, notes,
           source_product_id
    from public.commission_requests where id = ${requestId}`;
  if (!req?.makerId) return null;
  const [existing] = await sql()<
    { id: string }[]
  >`select id from public.message_threads where commission_request_id = ${req.id}`;
  if (existing) return existing.id;

  let context: ThreadContext = { commissionGarment: req.garmentType };
  if (req.sourceProductId) {
    try {
      context = { ...(await productContext(req.sourceProductId)).context, ...context };
    } catch {
      // The inspiration piece is gone; the request still stands on its own.
    }
  }
  const summary = [
    `Custom request: ${req.garmentType}${req.occasion ? ` for ${req.occasion}` : ''}.`,
    `Budget ${formatPrice(req.budgetMinCents)}–${formatPrice(req.budgetMaxCents)}.`,
    req.deadlineDate
      ? `Needed by ${new Date(req.deadlineDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}.`
      : null,
    req.notes ? `\n\n${req.notes}` : null,
  ]
    .filter(Boolean)
    .join(' ');

  return sql().begin(async (tx) => {
    const db = tx as unknown as Db;
    const [t] = await db<{ id: string }[]>`
      insert into public.message_threads (buyer_user_id, maker_id, product_id, commission_request_id, kind, context,
        maker_unread, maker_needs_reply, reply_due_at)
      values (${req.buyerUserId}, ${req.makerId}, ${req.sourceProductId}, ${req.id}, 'custom_request', ${db.json(context as never)},
        1, true, now() + make_interval(hours => ${REPLY_WINDOW_HOURS}))
      on conflict (commission_request_id) where commission_request_id is not null do nothing
      returning id`;
    if (!t) {
      const [again] = await db<
        { id: string }[]
      >`select id from public.message_threads where commission_request_id = ${req.id}`;
      return again!.id;
    }
    await db`
      insert into public.messages (thread_id, sender_user_id, body, kind)
      values (${t.id}, ${req.buyerUserId}, ${summary.slice(0, 2000)}, 'system')`;
    return t.id;
  });
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

function checkMessage(body: string, sender: 'buyer' | 'maker') {
  const clean = sanitizeText(body);
  if (!clean) throw new UserError('Write a message.');
  const result = moderateMessage(clean);
  return { clean, result, blocked: blockedMessage(sender) };
}

interface ThreadRow {
  id: string;
  buyerUserId: string;
  makerId: string;
  context: ThreadContext;
  buyerBlockedAt: Date | null;
}

/** Counters after a message: the other side gains an unread; a buyer message starts the clock. */
async function bumpCounters(db: Db, thread: ThreadRow, fromBuyer: boolean) {
  if (fromBuyer)
    await db`
      update public.message_threads set last_message_at = now(), buyer_last_read_at = now(), buyer_unread = 0,
        maker_unread = maker_unread + 1, maker_needs_reply = true,
        reply_due_at = case when maker_needs_reply and reply_due_at is not null then reply_due_at
                            else now() + make_interval(hours => ${REPLY_WINDOW_HOURS}) end,
        status = case when status = 'resolved' then 'open'::conversation_status else status end
      where id = ${thread.id}`;
  else
    await db`
      update public.message_threads set last_message_at = now(), maker_last_read_at = now(), maker_unread = 0,
        buyer_unread = buyer_unread + 1, maker_needs_reply = false, reply_due_at = null
      where id = ${thread.id}`;
}

/**
 * Sends a message as a thread participant (RLS enforces participation). Messages that share
 * contact details or propose off-platform payment are stored flagged for review, never
 * delivered, and the sender sees why.
 */
export async function sendMessage(
  sender: Actor,
  input: { threadId: string; body: string; imageUrls: string[] },
): Promise<{ messageId: string }> {
  await rateLimit('message', sender.id);
  await rateLimit('messageHourly', sender.id);

  const out = await withUser(sender, async (db) => {
    const [thread] = await db<ThreadRow[]>`
      select id, buyer_user_id, maker_id, context, buyer_blocked_at from public.message_threads where id = ${input.threadId}`;
    if (!thread) throw new UserError('Conversation not found.');
    const fromBuyer = thread.buyerUserId === sender.id;
    if (fromBuyer && thread.buyerBlockedAt)
      throw new UserError('This maker isn’t accepting messages from you.');
    const { clean, result, blocked } = checkMessage(input.body, fromBuyer ? 'buyer' : 'maker');
    const [msg] = await db<{ id: string }[]>`
      insert into public.messages (thread_id, sender_user_id, body, image_urls, is_flagged, flag_reason)
      values (${thread.id}, ${sender.id}, ${clean}, ${input.imageUrls}, ${!result.allowed},
        ${result.allowed ? null : result.reasons.join(',')})
      returning id`;
    if (result.allowed) await bumpCounters(db, thread, fromBuyer);
    return { messageId: msg!.id, thread, fromBuyer, result, blocked };
  });

  if (!out.result.allowed) {
    await audit(
      'message.blocked',
      { type: 'message', id: out.messageId },
      { reasons: out.result.reasons, threadId: input.threadId },
      sender.id,
    );
    throw new ModerationError(out.blocked);
  }

  await notify(sender, out.thread, out.fromBuyer);
  if (!out.fromBuyer) await refreshResponseTime(out.thread.makerId);
  return { messageId: out.messageId };
}

/**
 * Makers get an email for the first message in a conversation, then at most one digest an hour
 * while messages stay unread. Buyers hear about every maker reply.
 */
async function notify(sender: Actor, thread: ThreadRow, fromBuyer: boolean) {
  if (fromBuyer) {
    const [maker] = await sql()<
      {
        email: string;
        userId: string;
        firstMessage: boolean;
        digestDue: boolean;
        unreadThreads: number;
      }[]
    >`
      select u.email, u.id as user_id,
        (select count(*) from public.messages m where m.thread_id = ${thread.id} and m.sender_user_id = ${sender.id}
           and not m.is_flagged and m.kind = 'text') = 1 as first_message,
        (mk.message_digest_sent_at is null or mk.message_digest_sent_at < now() - interval '1 hour') as digest_due,
        (select count(*) from public.message_threads t where t.maker_id = mk.id and t.maker_unread > 0)::int as unread_threads
      from public.makers mk join public.users u on u.id = mk.user_id where mk.id = ${thread.makerId}`;
    if (!maker || !(await prefsFor(maker.userId)).message.email) return;
    if (maker.firstMessage) {
      await sendEmail(
        emails.newMessage(
          maker.email,
          thread.id,
          sender.displayName ?? 'A shopper',
          thread.context?.productTitle ?? thread.context?.commissionGarment ?? null,
          true,
        ),
      );
      await sql()`update public.makers set message_digest_sent_at = now() where id = ${thread.makerId}`;
    } else if (maker.digestDue) {
      await sendEmail(emails.messageDigest(maker.email, maker.unreadThreads, thread.makerId));
      await sql()`update public.makers set message_digest_sent_at = now() where id = ${thread.makerId}`;
    }
    return;
  }
  const [buyer] = await sql()<
    { email: string; makerName: string }[]
  >`select u.email, m.display_name as maker_name from public.users u, public.makers m
    where u.id = ${thread.buyerUserId} and m.id = ${thread.makerId}`;
  if (buyer && (await buyerPrefs(thread.buyerUserId)).maker_messages)
    await sendEmail(
      emails.newMessage(
        buyer.email,
        thread.id,
        buyer.makerName,
        thread.context?.productTitle ?? thread.context?.commissionGarment ?? null,
        false,
      ),
    );
}

export interface QuoteInputShort {
  threadId: string;
  priceCents: number;
  depositPct: number;
  weeks: number;
  note?: string;
}

/** Maker sends a quote inside a custom-request conversation. */
export async function sendQuote(maker: Actor, input: QuoteInputShort): Promise<void> {
  const [thread] = await withUser(
    maker,
    (db) => db<(ThreadRow & { commissionRequestId: string | null; kind: string })[]>`
      select id, buyer_user_id, maker_id, context, buyer_blocked_at, commission_request_id, kind
      from public.message_threads where id = ${input.threadId} and maker_id = ${maker.makerId ?? null}`,
  );
  if (!thread?.commissionRequestId)
    throw new UserError('Quotes can only be sent on custom requests.');
  const note = input.note ? sanitizeText(input.note) : '';
  if (note && !moderateMessage(note).allowed) throw new ModerationError(blockedMessage('maker'));
  const deposit = Math.round((input.priceCents * input.depositPct) / 100);
  const days = input.weeks * 7;
  const { createQuote } = await import('./commissions');
  const quoteId = await createQuote(maker, {
    requestId: thread.commissionRequestId,
    totalPrice: input.priceCents,
    deposit,
    productionDays: days,
    revisionsIncluded: 1,
    shipping: 0,
    estimatedDeliveryDate: new Date(Date.now() + (days + 7) * 86_400_000)
      .toISOString()
      .slice(0, 10),
    message: note || undefined,
  });
  const quote: QuoteSnapshot = {
    price_cents: input.priceCents,
    deposit_pct: input.depositPct,
    weeks: input.weeks,
    note: note || null,
    quote_id: quoteId,
  };
  await withUser(maker, async (db) => {
    await db`
      insert into public.messages (thread_id, sender_user_id, body, kind, quote)
      values (${thread.id}, ${maker.id}, ${`Quote: ${formatPrice(input.priceCents)}, ${input.depositPct}% deposit, made in ${input.weeks} ${input.weeks === 1 ? 'week' : 'weeks'}`},
        'quote', ${db.json(quote as never)})`;
    await bumpCounters(db, thread, false);
  });
  await refreshResponseTime(thread.makerId);
}

// ---------------------------------------------------------------------------
// Maker tools
// ---------------------------------------------------------------------------

export async function setNeedsReply(maker: Actor, threadId: string, needsReply: boolean) {
  const rows = await withUser(
    maker,
    (db) => db`
      update public.message_threads set maker_needs_reply = ${needsReply},
        reply_due_at = case when ${needsReply} then coalesce(reply_due_at, now() + make_interval(hours => ${REPLY_WINDOW_HOURS})) else null end,
        maker_unread = case when ${needsReply} then greatest(maker_unread, 1) else 0 end
      where id = ${threadId} and maker_id = ${maker.makerId ?? null} returning id`,
  );
  if (!rows.length) throw new UserError('Conversation not found.');
}

export async function reportThread(user: Actor, threadId: string) {
  const rows = await withUser(
    user,
    (db) => db`
      update public.message_threads set status = 'reported'
      where id = ${threadId} and (buyer_user_id = ${user.id} or maker_id = ${user.makerId ?? null}) returning id`,
  );
  if (!rows.length) throw new UserError('Conversation not found.');
  await audit('message_thread.reported', { type: 'message_thread', id: threadId }, {}, user.id);
  await sendEmail({
    to: env().ADMIN_NOTIFICATION_EMAIL,
    template: 'thread_reported',
    subject: 'A conversation was reported',
    text: `A conversation was reported and needs review.\n\n${env().APP_URL}/admin/moderation`,
    related: { type: 'message_thread', id: threadId },
  });
}

export async function blockBuyer(maker: Actor, threadId: string) {
  const rows = await withUser(
    maker,
    (db) => db`
      update public.message_threads set buyer_blocked_at = now(), maker_needs_reply = false, reply_due_at = null
      where id = ${threadId} and maker_id = ${maker.makerId ?? null} returning id`,
  );
  if (!rows.length) throw new UserError('Conversation not found.');
  await audit(
    'message_thread.buyer_blocked',
    { type: 'message_thread', id: threadId },
    {},
    maker.id,
  );
}

/** Median hours between a buyer's message and the maker's next reply over the last 90 days. */
export async function refreshResponseTime(makerId: string) {
  await sql()`
    with buyer_msgs as (
      select m.thread_id, m.created_at
      from public.messages m join public.message_threads t on t.id = m.thread_id
      where t.maker_id = ${makerId} and m.sender_user_id = t.buyer_user_id and not m.is_flagged and m.kind = 'text'
        and m.created_at > now() - interval '90 days'
    ), replies as (
      select b.created_at as asked_at,
        (select min(r.created_at) from public.messages r join public.message_threads t2 on t2.id = r.thread_id
         where r.thread_id = b.thread_id and r.created_at > b.created_at and r.sender_user_id <> t2.buyer_user_id) as replied_at
      from buyer_msgs b
    )
    update public.makers set response_time_hours = greatest(1, ceil(coalesce((
      select percentile_cont(0.5) within group (order by extract(epoch from replied_at - asked_at) / 3600)
      from replies where replied_at is not null), response_time_hours)))::int
    where id = ${makerId}`;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export interface ThreadSummary {
  id: string;
  kind: 'enquiry' | 'custom_request';
  context: ThreadContext;
  lastMessageAt: Date;
  counterpartName: string;
  counterpartAvatar: string | null;
  lastBody: string | null;
  lastFromMe: boolean;
  unreadCount: number;
  /** Kept for older callers: any unread messages. */
  unread: boolean;
  needsReply: boolean;
  replyDueAt: Date | null;
  makerSlug: string;
  commissionRequestId: string | null;
}

export async function listThreads(
  user: Actor,
  as: 'buyer' | 'maker',
  opts: { kind?: 'enquiry' | 'custom_request'; unreadOnly?: boolean; needsReply?: boolean } = {},
): Promise<ThreadSummary[]> {
  return withUser(
    user,
    (db) =>
      db<ThreadSummary[]>`
      select t.id, t.kind, t.context, t.last_message_at, t.commission_request_id, m.slug as maker_slug,
        t.maker_needs_reply as needs_reply, t.reply_due_at,
        ${as === 'buyer' ? db`m.display_name` : db`public.user_first_name(t.buyer_user_id)`} as counterpart_name,
        ${as === 'buyer' ? db`m.avatar_url` : db`null`} as counterpart_avatar,
        last.body as last_body, (last.sender_user_id = ${user.id}) as last_from_me,
        ${as === 'buyer' ? db`t.buyer_unread` : db`t.maker_unread`} as unread_count,
        (${as === 'buyer' ? db`t.buyer_unread` : db`t.maker_unread`} > 0) as unread
      from public.message_threads t
      join public.makers m on m.id = t.maker_id
      join lateral (
        select x.body, x.sender_user_id from public.messages x
        where x.thread_id = t.id and (not x.is_flagged or x.sender_user_id = ${user.id})
        order by x.created_at desc limit 1
      ) last on true
      where ${as === 'buyer' ? db`t.buyer_user_id = ${user.id}` : db`t.maker_id = ${user.makerId ?? null}`}
        ${opts.kind ? db`and t.kind = ${opts.kind}` : db``}
        ${opts.unreadOnly ? (as === 'buyer' ? db`and t.buyer_unread > 0` : db`and t.maker_unread > 0`) : db``}
        ${opts.needsReply ? db`and t.maker_needs_reply` : db``}
      order by t.last_message_at desc
      limit 200`,
  );
}

export interface InboxCounts {
  chats: number;
  requests: number;
  needsReply: number;
  unread: number;
}

export async function inboxCounts(user: Actor, as: 'buyer' | 'maker'): Promise<InboxCounts> {
  const [row] = await withUser(
    user,
    (db) => db<InboxCounts[]>`
      select count(*) filter (where t.kind = 'enquiry')::int as chats,
             count(*) filter (where t.kind = 'custom_request')::int as requests,
             count(*) filter (where t.maker_needs_reply)::int as needs_reply,
             count(*) filter (where ${as === 'buyer' ? db`t.buyer_unread` : db`t.maker_unread`} > 0)::int as unread
      from public.message_threads t
      where ${as === 'buyer' ? db`t.buyer_user_id = ${user.id}` : db`t.maker_id = ${user.makerId ?? null}`}
        and exists (select 1 from public.messages x where x.thread_id = t.id)`,
  );
  return row ?? { chats: 0, requests: 0, needsReply: 0, unread: 0 };
}

export interface ThreadMessage {
  id: string;
  senderUserId: string;
  body: string;
  imageUrls: string[];
  isFlagged: boolean;
  flagReason: string | null;
  kind: 'text' | 'quote' | 'system';
  quote: QuoteSnapshot | null;
  createdAt: Date;
}

export interface ThreadDetail {
  id: string;
  kind: 'enquiry' | 'custom_request';
  status: 'open' | 'resolved' | 'reported';
  buyerUserId: string;
  makerId: string;
  productId: string | null;
  commissionRequestId: string | null;
  context: ThreadContext;
  makerName: string;
  makerSlug: string;
  makerAvatar: string | null;
  makerResponseHours: number;
  makerRating: number;
  makerReviewCount: number;
  makerSold: number;
  makerSuburb: string | null;
  buyerName: string;
  needsReply: boolean;
  replyDueAt: Date | null;
  buyerBlocked: boolean;
  messages: ThreadMessage[];
}

export async function getThread(
  user: Actor,
  threadId: string,
  after?: Date,
): Promise<ThreadDetail | null> {
  return withUser(user, async (db: Db) => {
    const [t] = await db<Omit<ThreadDetail, 'messages'>[]>`
      select t.id, t.kind, t.status, t.buyer_user_id, t.maker_id, t.product_id, t.commission_request_id, t.context,
             m.display_name as maker_name, m.slug as maker_slug, m.avatar_url as maker_avatar,
             m.response_time_hours as maker_response_hours, m.rating::float as maker_rating,
             m.review_count as maker_review_count, m.completed_orders as maker_sold,
             nullif(trim(split_part(coalesce(m.location, m.city, ''), ',', 1)), '') as maker_suburb,
             t.maker_needs_reply as needs_reply, t.reply_due_at, (t.buyer_blocked_at is not null) as buyer_blocked,
             public.user_first_name(t.buyer_user_id) as buyer_name
      from public.message_threads t join public.makers m on m.id = t.maker_id
      where t.id = ${threadId}`;
    if (!t) return null;
    const messages = await db<ThreadMessage[]>`
      select id, sender_user_id, body, image_urls, is_flagged, flag_reason, kind, quote, created_at from public.messages
      where thread_id = ${threadId} and (not is_flagged or sender_user_id = ${user.id})
        ${after ? db`and created_at > ${after}` : db``}
      order by created_at asc limit 500`;
    const isBuyer = t.buyerUserId === user.id;
    await db`
      update public.message_threads set
        ${isBuyer ? db`buyer_last_read_at = now(), buyer_unread = 0` : db`maker_last_read_at = now(), maker_unread = 0`}
      where id = ${threadId}`;
    return { ...t, messages };
  });
}

/** Conversations with unread messages, for the header and tab bar badges. */
export async function unreadCount(user: Actor): Promise<number> {
  const [row] = await withUser(
    user,
    (db) => db<{ n: number }[]>`
    select count(*)::int as n from public.message_threads t
    where (t.buyer_user_id = ${user.id} and t.buyer_unread > 0)
       or (t.maker_id = ${user.makerId ?? null} and t.maker_unread > 0)`,
  );
  return row?.n ?? 0;
}

// ---------------------------------------------------------------------------
// Side panels
// ---------------------------------------------------------------------------

export interface PieceInfo {
  id: string;
  slug: string;
  title: string;
  priceCents: number;
  productType: ProductType;
  leadTimeDays: number | null;
  imageUrl: string | null;
  totalStock: number;
  shippingCents: number;
  freeShippingOverCents: number | null;
  dispatchDays: number;
  previewOnly: boolean;
  variants: Array<{ id: string; size: string; colour: string | null; stock: number }>;
  views7d: number;
  saves: number;
  openEnquiries: number;
}

export async function getPieceInfo(productId: string): Promise<PieceInfo | null> {
  const [p] = await sql()<PieceInfo[]>`
    select p.id, p.slug, p.title, p.price_cents, p.product_type, p.lead_time_days, p.save_count as saves,
      ('preview-only' = any(p.tags)) as preview_only,
      (select public_url from public.product_images i where i.product_id = p.id order by sort_order limit 1) as image_url,
      coalesce((select sum(v.stock_quantity) from public.product_variants v where v.product_id = p.id and v.is_active), 0)::int as total_stock,
      m.shipping_standard_cents as shipping_cents, m.free_shipping_over_cents, m.dispatch_days,
      coalesce((select json_agg(json_build_object('id', v.id, 'size', v.size, 'colour', v.colour, 'stock', v.stock_quantity) order by v.sort_order)
        from public.product_variants v where v.product_id = p.id and v.is_active), '[]'::json) as variants,
      (select count(*) from public.product_views pv where pv.product_id = p.id and pv.created_at > now() - interval '7 days')::int as views7d,
      (select count(*) from public.message_threads t where t.product_id = p.id and t.status = 'open'
         and exists (select 1 from public.messages x where x.thread_id = t.id))::int as open_enquiries
    from public.products p join public.makers m on m.id = p.maker_id
    where p.id = ${productId} and p.status = 'approved' and m.status = 'approved'`;
  return p ?? null;
}

export interface BuyerInfo {
  name: string;
  initials: string;
  location: string | null;
  memberSince: Date;
  orders: number;
}

/** What a maker sees about the buyer in a conversation (no contact details). */
export async function getBuyerInfo(maker: Actor, threadId: string): Promise<BuyerInfo | null> {
  const [row] = await sql()<(Omit<BuyerInfo, 'initials'> & { makerId: string })[]>`
    select t.maker_id, public.user_first_name(t.buyer_user_id) as name, u.created_at as member_since,
      (select o.shipping_address->>'city' from public.orders o where o.buyer_user_id = u.id and o.shipping_address is not null
         order by o.created_at desc limit 1) as location,
      (select count(*) from public.orders o where o.buyer_user_id = u.id and o.status in ('paid', 'partially_refunded', 'refunded'))::int as orders
    from public.message_threads t join public.users u on u.id = t.buyer_user_id where t.id = ${threadId}`;
  if (!row || row.makerId !== maker.makerId) return null;
  const { makerId: _m, ...info } = row;
  const initials =
    info.name
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?';
  return { ...info, initials };
}

export interface QuoteView {
  requestId: string;
  status: string;
  totalPriceCents: number;
  depositCents: number;
  productionDays: number;
  quoteStatus: string;
  depositPaidAt: Date | null;
}

export async function getLatestQuote(requestId: string): Promise<QuoteView | null> {
  const [q] = await sql()<QuoteView[]>`
    select c.id as request_id, c.status, q.total_price_cents, q.deposit_cents, q.production_days, q.status as quote_status,
           c.deposit_paid_at
    from public.commission_requests c
    join public.commission_quotes q on q.commission_request_id = c.id
    where c.id = ${requestId}
    order by q.created_at desc limit 1`;
  return q ?? null;
}

export interface MessageStats {
  replyHours: number;
  conversionPct: number;
  enquiries30d: number;
}

/** Studio inbox stats: typical reply time and enquiry-to-sale conversion over 30 days. */
export async function getMessageStats(maker: Actor): Promise<MessageStats> {
  const [row] = await sql()<MessageStats[]>`
    with enquiries as (
      select t.id, t.buyer_user_id, t.product_id, t.created_at from public.message_threads t
      where t.maker_id = ${maker.makerId ?? null} and t.kind = 'enquiry' and t.product_id is not null
        and t.created_at > now() - interval '30 days'
        and exists (select 1 from public.messages x where x.thread_id = t.id)
    )
    select (select response_time_hours from public.makers where id = ${maker.makerId ?? null}) as reply_hours,
      (select count(*) from enquiries)::int as enquiries30d,
      coalesce(round(100.0 * (select count(*) from enquiries e where exists (
        select 1 from public.order_items oi join public.orders o on o.id = oi.order_id
        where o.buyer_user_id = e.buyer_user_id and oi.product_id = e.product_id
          and o.status in ('paid', 'partially_refunded') and o.created_at > e.created_at))
        / nullif((select count(*) from enquiries), 0)), 0)::int as conversion_pct`;
  return row ?? { replyHours: 24, conversionPct: 0, enquiries30d: 0 };
}
