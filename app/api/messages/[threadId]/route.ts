import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth/session';
import { getThread } from '@/lib/services/messaging';

/** Polling endpoint for near-real-time thread updates (participants only, via RLS). */
export async function GET(req: Request, { params }: { params: { threadId: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const id = z.string().uuid().safeParse(params.threadId);
  if (!id.success) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const afterParam = new URL(req.url).searchParams.get('after');
  const after =
    afterParam && !Number.isNaN(Date.parse(afterParam)) ? new Date(afterParam) : undefined;
  const thread = await getThread(user, id.data, after);
  if (!thread) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(
    { messages: thread.messages },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
