import { NextResponse } from 'next/server';
import { isPreviewOnly } from '@/lib/domain/preview';
import { shopBuyable } from '@/lib/domain/shop';
import { checkoutEnabled } from '@/lib/features';
import { getProduct } from '@/lib/queries/catalog';

export const dynamic = 'force-dynamic';

/**
 * What the long-press "quick add" sheet needs: the piece, its sizes and whether it can be bought
 * right now. Custom sizes need measurements, so they're left to the product page.
 */
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const p = await getProduct(decodeURIComponent(params.slug));
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const sale = shopBuyable(p.maker);
  const previewOnly = isPreviewOnly(p.tags);
  const open = await checkoutEnabled();
  const variants = p.variants
    .filter((v) => v.size.toLowerCase() !== 'custom')
    .map((v) => ({
      id: v.id,
      size: v.size,
      colour: v.colour,
      // Made-to-order pieces are made after purchase, so they're never "sold out".
      available: p.productType === 'made_to_order' || v.stockQuantity > 0,
    }));
  return NextResponse.json(
    {
      id: p.id,
      slug: p.slug,
      title: p.title,
      priceCents: p.priceCents,
      imageUrl: p.images[0]?.url ?? null,
      makerName: p.maker.displayName,
      productType: p.productType,
      multiColour: new Set(variants.map((v) => v.colour).filter(Boolean)).size > 1,
      variants,
      canBuy: open && !previewOnly && sale.ok,
      reason: previewOnly
        ? 'Preview only'
        : !open
          ? 'Opening soon. Join the waitlist.'
          : sale.ok
            ? null
            : sale.label,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
