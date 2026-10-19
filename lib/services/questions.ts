import { sql, withUser } from '@/lib/db';
import type { SessionUser } from '@/lib/auth/session';
import { moderateMessage, sanitizeText } from '@/lib/domain/moderation';
import { sendEmail } from '@/lib/email/send';
import { emails } from '@/lib/email/templates';
import { reportError } from '@/lib/log';
import { rateLimit } from '@/lib/rate-limit';
import { UserError } from './errors';
import { ModerationError } from './messaging';

type Actor = Pick<SessionUser, 'id' | 'role'>;

export const QUESTION_BLOCKED =
  'Questions are public, so contact details, bank details and links can’t be posted. Ask the maker privately instead.';

function clean(body: string) {
  const text = sanitizeText(body);
  if (!text) throw new UserError('Write your question first.');
  if (text.length > 600) throw new UserError('Keep it under 600 characters.');
  if (!moderateMessage(text).allowed) throw new ModerationError(QUESTION_BLOCKED);
  return text;
}

interface ProductRef {
  id: string;
  slug: string;
  title: string;
  makerName: string;
  makerEmail: string | null;
}

/** A shopper's public question. The maker is emailed; failures there never block the post. */
export async function askQuestion(user: Actor, productId: string, body: string): Promise<string> {
  const text = clean(body);
  await rateLimit('question', user.id);
  const id = await withUser(user, async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      insert into public.product_questions (product_id, user_id, body)
      values (${productId}, ${user.id}, ${text}) returning id`;
    return row!.id;
  });
  notify(async () => {
    const [p] = await sql()<(ProductRef & { askerName: string })[]>`
      select p.id, p.slug, p.title, m.display_name as maker_name,
        mu.email as maker_email, public.user_first_name(${user.id}) as asker_name
      from public.products p join public.makers m on m.id = p.maker_id
      left join public.users mu on mu.id = m.user_id where p.id = ${productId}`;
    if (p?.makerEmail) await sendEmail(emails.productQuestion(p.makerEmail, p, p.askerName, text));
  });
  return id;
}

/** The maker's public reply to a question on one of their pieces. */
export async function replyToQuestion(user: Actor, questionId: string, body: string) {
  const text = clean(body);
  await rateLimit('question', user.id);
  const [q] = await sql()<{ productId: string; userId: string; parentId: string | null }[]>`
    select product_id, user_id, parent_id from public.product_questions where id = ${questionId}`;
  if (!q || q.parentId) throw new UserError('That question no longer exists.');
  await withUser(
    user,
    (tx) => tx`
    insert into public.product_questions (product_id, user_id, body, parent_id, is_maker_reply)
    values (${q.productId}, ${user.id}, ${text}, ${questionId}, true)`,
  );
  notify(async () => {
    const [p] = await sql()<(ProductRef & { askerEmail: string | null })[]>`
      select p.id, p.slug, p.title, m.display_name as maker_name, u.email as asker_email
      from public.products p join public.makers m on m.id = p.maker_id
      left join public.users u on u.id = ${q.userId} where p.id = ${q.productId}`;
    if (p?.askerEmail) await sendEmail(emails.questionAnswered(p.askerEmail, p, p.makerName));
  });
  return q.productId;
}

function notify(fn: () => Promise<void>) {
  fn().catch((err) => reportError(err, { where: 'product question email' }));
}
