import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

/** Short order links from texts: /o/<reply token> → the order panel in Studio. */
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const base = env().APP_URL;
  if (!/^[A-Za-z0-9_-]{6,32}$/.test(params.token))
    return NextResponse.redirect(`${base}/studio/orders`);
  const [f] = await sql()<{ id: string }[]>`
    select id from public.fulfilments where reply_token = ${params.token}`;
  return NextResponse.redirect(`${base}/studio/orders${f ? `?order=${f.id}` : ''}`);
}
