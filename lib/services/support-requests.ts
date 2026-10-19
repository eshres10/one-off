import { z } from 'zod';
import { audit } from '@/lib/audit';
import { sql } from '@/lib/db';
import { sanitizeText } from '@/lib/domain/moderation';
import { sendEmail } from '@/lib/email/send';
import { env } from '@/lib/env';
import { SITE } from '@/lib/site/config';

export const SUPPORT_TOPICS = [
  { value: 'order', label: 'An order' },
  { value: 'returns', label: 'Returns or a problem' },
  { value: 'payments', label: 'Payments' },
  { value: 'selling', label: 'Selling on One Off' },
  { value: 'other', label: 'Something else' },
] as const;

export const supportRequestSchema = z.object({
  name: z.string().trim().min(1, 'Add your name').max(120),
  email: z.string().trim().email('Add an email we can reply to').max(254),
  topic: z.enum(['order', 'returns', 'payments', 'selling', 'other']),
  orderNumber: z.string().trim().max(40).optional().default(''),
  message: z.string().trim().min(10, 'Tell us a little more (at least 10 characters)').max(4000),
});
export type SupportRequestInput = z.infer<typeof supportRequestSchema>;

/** Stores a Help & FAQ "Message us" request and emails it to the support inbox. */
export async function createSupportRequest(input: SupportRequestInput, userId: string | null) {
  const [row] = await sql()<{ id: string }[]>`
    insert into public.support_requests (user_id, name, email, topic, order_number, message)
    values (${userId}, ${sanitizeText(input.name)}, ${input.email.toLowerCase()}, ${input.topic},
      ${input.orderNumber ? sanitizeText(input.orderNumber).toUpperCase() : null}, ${sanitizeText(input.message)})
    returning id`;
  const topic = SUPPORT_TOPICS.find((t) => t.value === input.topic)!.label;
  await sendEmail({
    to: SITE.supportEmail,
    replyTo: input.email,
    template: 'support_request',
    subject: `Help request: ${topic}${input.orderNumber ? ` · ${input.orderNumber}` : ''}`,
    text:
      `From ${input.name} <${input.email}>\nTopic: ${topic}` +
      (input.orderNumber ? `\nOrder: ${input.orderNumber}` : '') +
      `\n\n${input.message}\n\nReply to this email to answer them.\n${env().APP_URL}/admin/support-requests`,
    related: { type: 'support_request', id: row!.id },
  });
  await audit(
    'support_request.created',
    { type: 'support_request', id: row!.id },
    { topic },
    userId,
  );
  return row!.id;
}

export async function listSupportRequests() {
  return sql()<
    {
      id: string;
      name: string;
      email: string;
      topic: string;
      orderNumber: string | null;
      message: string;
      status: string;
      createdAt: Date;
    }[]
  >`select id, name, email, topic, order_number, message, status, created_at
    from public.support_requests order by created_at desc limit 200`;
}
