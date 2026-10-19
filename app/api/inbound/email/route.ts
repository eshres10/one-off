import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { reportError } from '@/lib/log';
import { handleInboundReply } from '@/lib/services/inbound';

export const dynamic = 'force-dynamic';

const same = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Field names differ by provider (Resend, Postmark, Cloudflare workers…); accept the common ones. */
function pick(body: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = body[k];
    if (typeof v === 'string' && v) return v;
    if (Array.isArray(v) && v.length) return v.map(String).join(', ');
  }
  return '';
}

/**
 * Inbound email webhook: makers reply to a new-order email with a tracking number. The
 * provider authenticates with `Authorization: Bearer <INBOUND_EMAIL_SECRET>`.
 */
export async function POST(req: Request) {
  const secret = env().INBOUND_EMAIL_SECRET;
  const auth = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!secret || !same(auth, secret))
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  try {
    const result = await handleInboundReply({
      to: pick(body, 'to', 'To', 'recipient', 'OriginalRecipient'),
      from: pick(body, 'from', 'From', 'sender'),
      text: pick(body, 'text', 'TextBody', 'plain', 'body'),
    });
    return NextResponse.json({ result });
  } catch (err) {
    reportError(err, { where: 'inbound email' });
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
