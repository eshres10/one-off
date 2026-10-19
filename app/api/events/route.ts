import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth/session';
import { sql } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';

const ALLOWED = [
  'install_sheet_shown',
  'install_sheet_dismissed',
  'install_accepted',
  'install_copied_link',
  'push_enabled',
  'push_declined',
] as const;

const schema = z.object({
  name: z.enum(ALLOWED),
  props: z.record(z.union([z.string().max(120), z.number(), z.boolean(), z.null()])).default({}),
  path: z.string().max(300).optional(),
});

/** Records a small analytics event from the browser (see lib/client/track.ts). */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  const ip = (req.headers.get('x-forwarded-for') ?? 'local').split(',')[0]!.trim();
  try {
    await rateLimit('clientEvent', ip);
  } catch {
    return NextResponse.json({ ok: false }, { status: 429 });
  }
  const user = await getSessionUser();
  await sql()`
    insert into public.client_events (name, props, path, user_id)
    values (${parsed.data.name}, ${sql().json(parsed.data.props)}, ${parsed.data.path ?? null}, ${user?.id ?? null})`;
  return NextResponse.json({ ok: true });
}
