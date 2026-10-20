import { NextResponse } from 'next/server';
import { countExplore } from '@/lib/queries/explore';

/** Live "Show N pieces" for the phone filter sheet. */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const total = await countExplore({
    q: p.get('q') ?? '',
    filter: p.get('filter') ?? 'all',
    size: p.get('size'),
    max: p.get('max') ? Number(p.get('max')) : null,
    colour: p.get('colour'),
    state: p.get('state'),
  });
  return NextResponse.json({ total }, { headers: { 'Cache-Control': 'no-store' } });
}
