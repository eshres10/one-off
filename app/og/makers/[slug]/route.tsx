import { NextResponse } from 'next/server';
import { renderShareCard } from '@/lib/og/card';
import { makerCard } from '@/lib/og/data';

export const runtime = 'nodejs';

/** The maker's link preview image (1200×630). ?v= changes with the cover, name or piece count. */
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const found = await makerCard(params.slug);
  if (!found) return new NextResponse(null, { status: 404 });
  return renderShareCard(found.card);
}
