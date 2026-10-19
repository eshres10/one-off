import { NextResponse } from 'next/server';
import { renderShareCard } from '@/lib/og/card';
import { productCard } from '@/lib/og/data';

export const runtime = 'nodejs';

/** The product's link preview image (1200×630). ?v= changes with its photo, name or price. */
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const found = await productCard(params.slug);
  if (!found) return new NextResponse(null, { status: 404 });
  return renderShareCard(found.card);
}
