import { NextResponse } from 'next/server';
import { z } from 'zod';
import { removePushSubscription } from '@/lib/services/push';

const schema = z.object({ endpoint: z.string().min(1).max(1000) });

/** The "Drop alerts" switch turned off: forgets this browser's subscription. */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  await removePushSubscription(parsed.data.endpoint);
  return NextResponse.json({ ok: true });
}
