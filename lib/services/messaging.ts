import { audit } from '@/lib/audit';
import { sql, withUser, type Db } from '@/lib/db';
import { moderateMessage, MODERATION_MESSAGES, sanitizeText } from '@/lib/domain/moderation';
import { emails } from '@/lib/email/templates';
import { sendEmail } from '@/lib/email/send';
import { rateLimit } from '@/lib/rate-limit';
import type { SessionUser } from '@/lib/auth/session';
import { UserError } from './errors';
import { variantLabel } from './cart';

export class ModerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModerationError';
  }
}

export interface ThreadContext {
  productTitle?: string;
  productSlug?: string;
  imageUrl?: string | null;
  priceCents?: number;
  productType?: string;
  variantLabel?: string | null;
  leadTimeDays?: number | null;
  commissionGarment?: string;
}

type Actor = Pick<SessionUser, 'id' | 'role' | 'displayName' | 'email' | 'makerId'>;

/** Finds or creates the buyer↔maker thread for a product, snapshotting the listing context. */
export async function startProductThread(
  buyer: Actor,
  input: { productId: string; variantId?: string; body: string; imageUrls: string[] },
): Promise<string> {
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
    where p.id = ${input.productId} and p.status = 'approved' and m.status = 'approved'`;
  if (!product) throw new UserError('This piece is no longer available.');
  if (product.makerUserId === buyer.id) throw new UserError('You can’t message yourself.');

  let label: string | null = null;
  if (input.variantId) {
    const [v] = await sql()<{ size: string; colour: string | null }[]>`
      select size, colour from public.product_variants where id = ${input.variantId} and product_id = ${product.id}`;
    if (v) label = variantLabel(v.size, v.colour, product.colourCount);
  }
  const context: ThreadContext = {
    productTitle: product.title,
    productSlug: product.slug,
    imageUrl: product.imageUrl,
    priceCents: product.priceCents,
    productType: product.productType,
    variantLabel: label,
    leadTimeDays: product.leadTimeDays,
  };

  // Reject empty messages before creating the thread.
  checkMessage(input.body);

  const threadId = await withUser(buyer, async (db) => {
    const [existing] = await db<{ id: string }[]>`
      select id from public.message_threads
      where buyer_user_id = ${buyer.id} and maker_id = ${product.makerId} and product_id = ${product.id} and commission_request_id is null`;
    if (existing) {
      await db`update public.message_threads set context = ${db.json(context as never)} where id = ${existing.id}`;
      return existing.id;
    }
    const [created] = await db<{ id: string }[]>`
      insert into public.message_threads (buyer_user_id, maker_id, product_id, context)
      values (${buyer.id}, ${product.makerId}, ${product.id}, ${db.json(context as never)}) returning id`;
    return created!.id;
  });
  await sendMessage(buyer, { threadId, body: input.body, imageUrls: input.imageUrls });
  return threadId;
}

/** General question to a maker (no specific product). */
export async function startMakerThread(
  buyer: Actor,
  input: { makerId: string; body: string; imageUrls: string[] },
): Promise<string> {
  const [maker] = await sql()<{ id: string; userId: string; displayName: string }[]>`
    select id, user_id, display_name from public.makers where id = ${input.makerId} and status = 'approved'`;
  if (!maker) throw new UserError('This maker isn’t available.');
  if (maker.userId === buyer.id) throw new UserError('You can’t message yourself.');
  checkMessage(input.body);
  const threadId = await withUser(buyer, async (db) => {
    const [existing] = await db<{ id: string }[]>`
      select id from public.message_threads
      where buyer_user_id = ${buyer.id} and maker_id = ${maker.id} and product_id is null and commission_request_id is null`;
    if (existing) return existing.id;
    const [created] = await db<{ id: string }[]>`
      insert into public.message_threads (buyer_user_id, maker_id, context) values (${buyer.id}, ${maker.id}, '{}'::jsonb) returning id`;
    return created!.id;
  });
  await sendMessage(buyer, { threadId, body: input.body, imageUrls: input.imageUrls });
  return threadId;
}

function checkMessage(body: string) {
  const clean = sanitizeText(body);
  if (!clean) throw new UserError('Write a message.');
  const result = moderateMessage(clean);
  return { clean, result };
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
  const { clean, result } = checkMessage(input.body);

  const out = await withUser(sender, async (db) => {
    const [thread] = await db<
      { id: string; buyerUserId: string; makerId: string; context: ThreadContext }[]
    >`
      select id, buyer_user_id, maker_id, context from public.message_threads where id = ${input.threadId}`;
    if (!thread) throw new UserError('Conversation not found.');
    const [msg] = await db<{ id: string }[]>`
      insert into public.messages (thread_id, sender_user_id, body, image_urls, is_flagged, flag_reason)
      values (${thread.id}, ${sender.id}, ${clean}, ${input.imageUrls}, ${!result.allowed},
        ${result.allowed ? null : result.reasons.join(',')})
      returning id`;
    if (result.allowed) {
      const isBuyer = thread.buyerUserId === sender.id;
      await db`
        update public.message_threads set last_message_at = now(),
          ${isBuyer ? db`buyer_last_read_at` : db`maker_last_read_at`} = now()
        where id = ${thread.id}`;
    }
    return { messageId: msg!.id, thread };
  });

  if (!result.allowed) {
    await audit(
      'message.flagged',
      { type: 'message', id: out.messageId },
      { reasons: result.reasons },
      sender.id,
    );
    throw new ModerationError(
      `${result.reasons.map((r) => MODERATION_MESSAGES[r]).join(' ')} For buyer protection, complete purchases through the platform.`,
    );
  }

  // Notify the other participant.
  const isBuyer = out.thread.buyerUserId === sender.id;
  const [recipient] = isBuyer
    ? await sql()<
        { email: string }[]
      >`select u.email from public.makers m join public.users u on u.id = m.user_id where m.id = ${out.thread.makerId}`
    : await sql()<
        { email: string }[]
      >`select email from public.users where id = ${out.thread.buyerUserId}`;
  if (recipient) {
    const fromName = isBuyer
      ? (sender.displayName ?? 'A shopper')
      : ((await makerName(out.thread.makerId)) ?? 'The maker');
    await sendEmail(
      emails.newMessage(
        recipient.email,
        input.threadId,
        fromName,
        out.thread.context?.productTitle ?? null,
        isBuyer,
      ),
    );
  }
  if (!isBuyer) await refreshResponseTime(out.thread.makerId);
  return { messageId: out.messageId };
}

async function makerName(makerId: string) {
  const [m] = await sql()<
    { displayName: string }[]
  >`select display_name from public.makers where id = ${makerId}`;
  return m?.displayName;
}

/** Median hours between a buyer's message and the maker's next reply over the last 90 days. */
export async function refreshResponseTime(makerId: string) {
  await sql()`
    with buyer_msgs as (
      select m.thread_id, m.created_at
      from public.messages m join public.message_threads t on t.id = m.thread_id
      where t.maker_id = ${makerId} and m.sender_user_id = t.buyer_user_id and not m.is_flagged
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

export interface ThreadSummary {
  id: string;
  context: ThreadContext;
  lastMessageAt: Date;
  counterpartName: string;
  counterpartAvatar: string | null;
  lastBody: string | null;
  unread: boolean;
  makerSlug: string;
  commissionRequestId: string | null;
}

export async function listThreads(user: Actor, as: 'buyer' | 'maker'): Promise<ThreadSummary[]> {
  return withUser(
    user,
    (db) =>
      db<ThreadSummary[]>`
      select t.id, t.context, t.last_message_at, t.commission_request_id, m.slug as maker_slug,
        ${as === 'buyer' ? db`m.display_name` : db`coalesce(u.display_name, 'Shopper')`} as counterpart_name,
        ${as === 'buyer' ? db`m.avatar_url` : db`null`} as counterpart_avatar,
        (select body from public.messages x where x.thread_id = t.id and (not x.is_flagged or x.sender_user_id = ${user.id})
           order by created_at desc limit 1) as last_body,
        (t.last_message_at > coalesce(${as === 'buyer' ? db`t.buyer_last_read_at` : db`t.maker_last_read_at`}, 'epoch')) as unread
      from public.message_threads t
      join public.makers m on m.id = t.maker_id
      join public.users u on u.id = t.buyer_user_id
      where ${as === 'buyer' ? db`t.buyer_user_id = ${user.id}` : db`t.maker_id = ${user.makerId ?? null}`}
      order by t.last_message_at desc
      limit 100`,
  );
}

export interface ThreadMessage {
  id: string;
  senderUserId: string;
  body: string;
  imageUrls: string[];
  isFlagged: boolean;
  flagReason: string | null;
  createdAt: Date;
}

export interface ThreadDetail {
  id: string;
  buyerUserId: string;
  makerId: string;
  productId: string | null;
  context: ThreadContext;
  makerName: string;
  makerSlug: string;
  makerAvatar: string | null;
  makerResponseHours: number;
  buyerName: string;
  messages: ThreadMessage[];
}

export async function getThread(
  user: Actor,
  threadId: string,
  after?: Date,
): Promise<ThreadDetail | null> {
  return withUser(user, async (db: Db) => {
    const [t] = await db<Omit<ThreadDetail, 'messages'>[]>`
      select t.id, t.buyer_user_id, t.maker_id, t.product_id, t.context, m.display_name as maker_name, m.slug as maker_slug,
             m.avatar_url as maker_avatar, m.response_time_hours as maker_response_hours,
             coalesce(u.display_name, 'Shopper') as buyer_name
      from public.message_threads t join public.makers m on m.id = t.maker_id join public.users u on u.id = t.buyer_user_id
      where t.id = ${threadId}`;
    if (!t) return null;
    const messages = await db<ThreadMessage[]>`
      select id, sender_user_id, body, image_urls, is_flagged, flag_reason, created_at from public.messages
      where thread_id = ${threadId} and (not is_flagged or sender_user_id = ${user.id})
        ${after ? db`and created_at > ${after}` : db``}
      order by created_at asc limit 500`;
    const isBuyer = t.buyerUserId === user.id;
    await db`update public.message_threads set ${isBuyer ? db`buyer_last_read_at` : db`maker_last_read_at`} = now() where id = ${threadId}`;
    return { ...t, messages };
  });
}

export async function unreadCount(user: Actor): Promise<number> {
  const [row] = await withUser(
    user,
    (db) => db<{ n: number }[]>`
    select count(*)::int as n from public.message_threads t
    where (t.buyer_user_id = ${user.id} and t.last_message_at > coalesce(t.buyer_last_read_at, 'epoch'))
       or (t.maker_id = ${user.makerId ?? null} and t.last_message_at > coalesce(t.maker_last_read_at, 'epoch'))`,
  );
  return row?.n ?? 0;
}
