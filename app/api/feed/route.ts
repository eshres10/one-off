import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { PAGE_SIZE, getFeed, getSavedProductIds, parseFilters } from '@/lib/queries/catalog';

/** One page of the home feed for the phone app's endless scroll (?page=n, 1-based). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  const filters = parseFilters(raw);
  const page = Math.max(1, Math.min(20, Number(raw.page ?? 1) || 1));
  const user = await getSessionUser();
  const [{ items, hasMore }, saved] = await Promise.all([
    getFeed({ ...filters, page }, user?.id ?? null),
    getSavedProductIds(user?.id ?? null),
  ]);
  const slice = items.slice((page - 1) * PAGE_SIZE);
  return NextResponse.json(
    { items: slice, hasMore, saved: slice.filter((p) => saved.has(p.id)).map((p) => p.id) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
