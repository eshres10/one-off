import { NextResponse } from 'next/server';
import { RateLimitError } from '@/lib/rate-limit';
import { reportError } from '@/lib/log';
import { submissionSchema } from '@/lib/survey/schema';
import { submitSurvey } from '@/lib/services/survey';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The maker survey submission. Validates against the option keys, drops spam (honeypot, under
 * 20 seconds, more than 5 a day per IP hash), keeps contact details only with an opt-in and
 * consent, and inserts with the service role.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = submissionSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { ok: false, message: first?.message ?? 'Check your answers.', path: first?.path ?? [] },
      { status: 400 },
    );
  }
  const ip = (req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'local')
    .split(',')[0]!
    .trim();
  try {
    await submitSurvey(parsed.data, ip);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof RateLimitError)
      return NextResponse.json({ ok: false, message: err.message }, { status: 429 });
    reportError(err, { where: 'api:survey' });
    return NextResponse.json(
      { ok: false, message: 'Something went wrong. Please try again.' },
      { status: 500 },
    );
  }
}
