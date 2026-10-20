import { sql, withUser } from '@/lib/db';
import type { SessionUser } from '@/lib/auth/session';
import { env } from '@/lib/env';
import { sendEmail } from '@/lib/email/send';
import { emails } from '@/lib/email/templates';
import { sanitizeText } from '@/lib/domain/moderation';
import { UserError } from './errors';

type User = Pick<SessionUser, 'id' | 'role' | 'makerId' | 'email'>;

export interface SupportMessage {
  id: string;
  fromAdmin: boolean;
  body: string;
  topic: string | null;
  createdAt: Date;
}

export async function supportThread(
  user: Pick<User, 'id' | 'role' | 'makerId'>,
): Promise<SupportMessage[]> {
  const rows = await withUser(
    user,
    (db) => db<SupportMessage[]>`
      select id, from_admin, body, topic, created_at from public.support_messages
      where user_id = ${user.id} order by created_at`,
  );
  await sql()`update public.support_messages set read_at = now()
    where user_id = ${user.id} and from_admin and read_at is null`;
  return rows;
}

/** A maker writes to Off One; the team gets an email. */
export async function sendSupportMessage(user: User, body: string, topic: string | null = null) {
  const text = sanitizeText(body).trim().slice(0, 4000);
  if (!text) throw new UserError('Write a message first.');
  await withUser(user, async (db) => {
    await db`
      insert into public.support_messages (user_id, maker_id, sender_user_id, body, topic)
      values (${user.id}, ${user.makerId}, ${user.id}, ${text}, ${topic})`;
  });
  await sendEmail(
    emails.supportNew(env().ADMIN_NOTIFICATION_EMAIL, {
      userId: user.id,
      from: user.email,
      body: text,
      topic,
    }),
  );
}

export interface SupportConversation {
  userId: string;
  email: string;
  shop: string | null;
  last: string;
  lastAt: Date;
  waiting: boolean;
}

export async function supportInbox(): Promise<SupportConversation[]> {
  return sql()<SupportConversation[]>`
    select distinct on (s.user_id) s.user_id, u.email, m.display_name as shop, s.body as last, s.created_at as last_at,
      not s.from_admin as waiting
    from public.support_messages s join public.users u on u.id = s.user_id
    left join public.makers m on m.user_id = s.user_id
    order by s.user_id, s.created_at desc`.then((rows) =>
    [...rows].sort((a, b) => Number(b.waiting) - Number(a.waiting) || +b.lastAt - +a.lastAt),
  );
}

export async function adminThread(userId: string) {
  const [who] = await sql()<{ email: string; shop: string | null }[]>`
    select u.email, m.display_name as shop from public.users u
    left join public.makers m on m.user_id = u.id where u.id = ${userId}`;
  const messages = await sql()<SupportMessage[]>`
    select id, from_admin, body, topic, created_at from public.support_messages
    where user_id = ${userId} order by created_at`;
  return who ? { ...who, messages } : null;
}

/** Off One replies; the maker gets an email with a link back to Studio. */
export async function adminReply(adminId: string, userId: string, body: string) {
  const text = sanitizeText(body).trim().slice(0, 4000);
  if (!text) throw new UserError('Write a reply first.');
  const [who] = await sql()<
    { email: string }[]
  >`select email from public.users where id = ${userId}`;
  if (!who) throw new UserError('That conversation no longer exists.');
  await sql()`
    insert into public.support_messages (user_id, from_admin, sender_user_id, body)
    values (${userId}, true, ${adminId}, ${text})`;
  await sendEmail(emails.supportReply(who.email, text));
}
