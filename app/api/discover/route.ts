import { NextResponse } from 'next/server';
import { parseDiscover } from '@/lib/discover/params';
import { getSessionUser } from '@/lib/auth/session';
import { countDiscover, getDiscoverPage } from '@/lib/queries/discover';

/** Discover pages for infinite scroll (?cursor=) and live counts for the filters panel (?count=1). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const params = parseDiscover(url.searchParams);
  const headers = { 'Cache-Control': 'no-store' };
  if (url.searchParams.get('count') === '1')
    return NextResponse.json({ total: await countDiscover(params) }, { headers });
  const user = await getSessionUser();
  const page = await getDiscoverPage(params, url.searchParams.get('cursor'), user?.id ?? null);
  return NextResponse.json(page, { headers });
}
