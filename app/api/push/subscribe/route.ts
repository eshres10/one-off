import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth/session';
import { rateLimit } from '@/lib/rate-limit';
import { isPushEndpoint, savePushSubscription } from '@/lib/services/push';

const schema = z.object({
  endpoint: z.string().max(1000).refine(isPushEndpoint),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

/** "Turn on drop alerts": saves this browser's push subscription (upsert on the endpoint). */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  const ip = (req.headers.get('x-forwarded-for') ?? 'local').split(',')[0]!.trim();
  try {
    await rateLimit('pushSubscribe', ip);
  } catch {
    return NextResponse.json({ ok: false }, { status: 429 });
  }
  const user = await getSessionUser();
  await savePushSubscription({
    userId: user?.id ?? null,
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh,
    auth: parsed.data.keys.auth,
  });
  return NextResponse.json({ ok: true });
}
