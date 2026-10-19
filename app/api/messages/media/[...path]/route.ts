import { getSessionUser } from '@/lib/auth/session';
import { sql } from '@/lib/db';
import { isMessageMediaPath, MESSAGE_MEDIA_PREFIX, readMessagePhoto } from '@/lib/message-media';

/**
 * Message photos: only the sender, the other person in a conversation that uses the photo, and
 * admins can see them.
 */
export async function GET(_req: Request, { params }: { params: { path: string[] } }) {
  const user = await getSessionUser();
  if (!user) return new Response('Not found', { status: 404 });
  const objectPath = params.path.join('/');
  if (!isMessageMediaPath(objectPath)) return new Response('Not found', { status: 404 });
  const url = `${MESSAGE_MEDIA_PREFIX}${objectPath}`;
  const own = objectPath.startsWith(`${user.id}/`);
  if (!own && user.role !== 'admin') {
    const [row] = await sql()`
      select 1 from public.messages m join public.message_threads t on t.id = m.thread_id
      where ${url} = any(m.image_urls) and not m.is_flagged
        and (t.buyer_user_id = ${user.id} or t.maker_id = ${user.makerId ?? null})
      limit 1`;
    if (!row) return new Response('Not found', { status: 404 });
  }
  const file = await readMessagePhoto(objectPath);
  if (!file) return new Response('Not found', { status: 404 });
  return new Response(file.bytes, {
    headers: {
      'Content-Type': file.type,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
}
