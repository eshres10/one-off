import { NextResponse } from 'next/server';
import { z } from 'zod';
import { reportError } from '@/lib/log';
import { rateLimit } from '@/lib/rate-limit';

const body = z.object({
  message: z.string().max(500),
  digest: z.string().max(100).optional(),
  path: z.string().max(300).optional(),
});

/**
 * Errors caught by the error pages in the browser, reported to the server log (and to Sentry
 * when it's set up, through reportError). Rate limited per address.
 */
export async function POST(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0]!.trim();
  try {
    await rateLimit('clientError', ip);
  } catch {
    return new NextResponse(null, { status: 429 });
  }
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 400 });
  reportError(new Error(parsed.data.message), {
    where: 'client error page',
    digest: parsed.data.digest,
    path: parsed.data.path,
  });
  return new NextResponse(null, { status: 204 });
}
