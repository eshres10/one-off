import { sql } from '@/lib/db';
import { env } from '@/lib/env';
import { log, reportError } from '@/lib/log';

/** Australian mobile to E.164: "0412 345 678" → "+61412345678". Null when it isn't one. */
export function toE164(mobile: string | null | undefined): string | null {
  if (!mobile) return null;
  const d = mobile.replace(/[^\d+]/g, '');
  if (/^\+614\d{8}$/.test(d)) return d;
  if (/^614\d{8}$/.test(d)) return `+${d}`;
  if (/^04\d{8}$/.test(d)) return `+61${d.slice(1)}`;
  return null;
}

/**
 * Sends a text through Twilio when SMS_ENABLED is on; otherwise it's only logged. Every
 * attempt is recorded in notification_log. Failures never break the calling flow.
 */
export async function sendSms(to: string, body: string, template: string): Promise<void> {
  const e = env();
  let status: 'logged' | 'sent' | 'failed' = 'logged';
  let providerId: string | null = null;
  let error: string | null = null;

  if (e.SMS_ENABLED && e.TWILIO_ACCOUNT_SID && e.TWILIO_AUTH_TOKEN && e.TWILIO_FROM) {
    try {
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${e.TWILIO_ACCOUNT_SID}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${e.TWILIO_ACCOUNT_SID}:${e.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ To: to, From: e.TWILIO_FROM, Body: body }),
        },
      );
      const json = (await res.json()) as { sid?: string; message?: string };
      if (!res.ok) throw new Error(json.message ?? `Twilio ${res.status}`);
      providerId = json.sid ?? null;
      status = 'sent';
    } catch (err) {
      status = 'failed';
      error = err instanceof Error ? err.message : String(err);
      reportError(err, { template });
    }
  }

  try {
    await sql()`
      insert into public.notification_log (channel, to_address, template, body, status, provider_id, error)
      values ('sms', ${to}, ${template}, ${body}, ${status}, ${providerId}, ${error})`;
  } catch (err) {
    reportError(err, { where: 'notification_log' });
  }
  log.info({ template, status }, 'sms');
}
