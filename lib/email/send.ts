import { Resend } from 'resend';
import { sql } from '@/lib/db';
import { env } from '@/lib/env';
import { log, reportError } from '@/lib/log';
import { htmlFromText } from './layout';

export interface EmailMessage {
  to: string;
  template: string;
  subject: string;
  text: string;
  /** The branded HTML version; plain-text emails are wrapped in the layout automatically. */
  html?: string;
  replyTo?: string;
  related?: { type: string; id: string };
}

/**
 * Sends a transactional email. Every send is recorded in email_outbox (the outbox *is* the
 * delivery mechanism for the local driver, and an audit trail with Resend). Email failures
 * never break the calling flow.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  const e = env();
  let status: 'logged' | 'sent' | 'failed' = 'logged';
  let providerId: string | null = null;
  let error: string | null = null;
  const html = message.html ?? htmlFromText(message.subject, message.text);

  if (e.EMAIL_DRIVER === 'resend') {
    try {
      const resend = new Resend(e.RESEND_API_KEY);
      const res = await resend.emails.send({
        from: e.EMAIL_FROM,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html,
        ...(message.replyTo ? { replyTo: message.replyTo } : {}),
      });
      if (res.error) throw new Error(res.error.message);
      providerId = res.data?.id ?? null;
      status = 'sent';
    } catch (err) {
      status = 'failed';
      error = err instanceof Error ? err.message : String(err);
      reportError(err, { template: message.template });
    }
  }

  try {
    await sql()`
      insert into public.email_outbox (to_email, template, subject, body_text, body_html, provider, provider_message_id, status, error,
        related_entity_type, related_entity_id)
      values (${message.to}, ${message.template}, ${message.subject}, ${message.text}, ${html}, ${e.EMAIL_DRIVER}, ${providerId},
        ${status}, ${error}, ${message.related?.type ?? null}, ${message.related?.id ?? null})`;
  } catch (err) {
    reportError(err, { where: 'email_outbox' });
  }
  log.info({ template: message.template, status }, 'email');
}
