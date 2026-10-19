import Link from 'next/link';
import type { ReactNode } from 'react';
import type { ProductCard as Card } from '@/lib/queries/catalog';
import { formatPrice } from '@/lib/domain/money';
import { swatchColour } from '@/lib/colours';
import { Img as Image } from '@/components/ui/Img';
import { ProductBadgePill } from '@/components/ui/Badge';
import { Swatch } from '@/components/ui/Pill';
import { SaveButton } from './SaveButton';
import { LongPressAdd } from '@/components/product/LongPressAdd';

export function ProductCard({
  product,
  saved,
  priority = false,
  showSwatches = true,
}: {
  product: Card;
  saved: boolean;
  priority?: boolean;
  showSwatches?: boolean;
}) {
  const soldOut = product.badges.includes('sold_out');
  const badge =
    product.badges.find((b) => b === 'sold_out' || b === 'low_stock') ?? product.badges[0];
  return (
    <article className="group relative" data-testid="product-card">
      <LongPressAdd slug={product.slug}>
        <Link href={`/products/${product.slug}`} className="block" tabIndex={-1} aria-hidden>
          <div className="relative aspect-4/5 overflow-hidden bg-stone-light">
            {product.imageUrl && (
              <Image
                src={product.imageUrl}
                alt=""
                fill
                priority={priority}
                sizes="(min-width: 1280px) 22vw, (min-width: 768px) 30vw, 50vw"
                className={`object-cover object-top transition duration-700 group-hover:scale-[1.02] ${soldOut ? 'opacity-60' : ''}`}
              />
            )}
          </div>
        </Link>
      </LongPressAdd>
      {product.previewOnly ? (
        <span
          className="pointer-events-none absolute left-2 top-2 bg-ink px-2 py-[3px] text-[10px] uppercase leading-4 tracking-[0.14em] text-ground md:left-3 md:top-3"
          data-testid="preview-only-badge"
        >
          Preview only
        </span>
      ) : (
        badge && (
          <span className="pointer-events-none absolute left-2 top-2 md:left-3 md:top-3">
            <ProductBadgePill badge={badge} />
          </span>
        )
      )}
      <div className="absolute right-0 top-0">
        <SaveButton productId={product.id} saved={saved} title={product.title} />
      </div>
      <div className="px-2 pb-4 pt-2.5 md:px-3">
        <div className="flex items-baseline justify-between gap-3 text-[13px]">
          <h3 className="min-w-0 font-sans font-normal leading-snug">
            <Link
              href={`/products/${product.slug}`}
              className="-my-1 line-clamp-1 py-1 hover:underline"
              aria-label={
                product.imageAlt ? `${product.title}. ${product.imageAlt}` : product.title
              }
            >
              {product.title}
            </Link>
          </h3>
          <p className="shrink-0">{formatPrice(product.priceCents)}</p>
        </div>
        <Link
          href={`/makers/${product.makerSlug}`}
          className="relative z-10 mt-1 inline-block py-1 text-[12px] text-muted-2 hover:underline"
        >
          {product.makerName}
        </Link>
        {showSwatches && product.colours.length > 0 && (
          <div
            className="mt-2 flex gap-1.5"
            role="img"
            aria-label={`Colours: ${product.colours.join(', ')}`}
          >
            {product.colours.map((c) => (
              <Swatch key={c} colour={swatchColour(c)} />
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

export interface EditorialTileData {
  kicker: string;
  title: string;
  cta: string;
  href: string;
  imageUrl: string;
}

/** 2×2 editorial tile with bottom gradient, kicker, serif line and underlined CTA. */
export function EditorialTile({
  tile,
  className = '',
}: {
  tile: EditorialTileData;
  className?: string;
}) {
  return (
    <Link
      href={tile.href}
      className={`group relative block min-h-[420px] overflow-hidden bg-stone-light text-ground ${className}`}
    >
      <Image
        src={tile.imageUrl}
        alt=""
        fill
        sizes="(min-width: 768px) 50vw, 100vw"
        className="object-cover transition duration-700 group-hover:scale-[1.02]"
      />
      <span
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent"
      />
      <span className="absolute inset-x-0 bottom-0 p-6 md:p-8">
        <span className="block text-[11px] uppercase tracking-label">{tile.kicker}</span>
        <span className="mt-2 block font-display text-[40px] leading-[0.95] md:text-[48px]">
          {tile.title}
        </span>
        <span className="mt-3 inline-block text-[11px] uppercase tracking-label underline underline-offset-[6px]">
          {tile.cta}
        </span>
      </span>
    </Link>
  );
}

/** Edge-to-edge grid with 2px gaps; an editorial tile can be inserted every ~8 products. */
export function ProductGrid({
  products,
  savedIds,
  priorityCount = 4,
  editorial = [],
  every = 8,
}: {
  products: Card[];
  savedIds: Set<string>;
  priorityCount?: number;
  editorial?: EditorialTileData[];
  every?: number;
}) {
  const cells: ReactNode[] = [];
  products.forEach((p, i) => {
    if (editorial.length && i > 0 && i % every === 0) {
      const tile = editorial[(i / every - 1) % editorial.length]!;
      const right = (i / every) % 2 === 0;
      cells.push(
        <li key={`ed-${i}`} className={`col-span-2 row-span-2 ${right ? 'md:col-start-[-3]' : ''}`}>
          <EditorialTile tile={tile} className="h-full" />
        </li>,
      );
    }
    cells.push(
      <li key={p.id}>
        <ProductCard product={p} saved={savedIds.has(p.id)} priority={i < priorityCount} />
      </li>,
    );
  });
  return (
    <ul
      className="grid grid-flow-dense grid-cols-2 gap-[2px] md:grid-cols-[repeat(auto-fill,minmax(240px,1fr))]"
      role="list"
    >
      {cells}
    </ul>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <ul
      className="grid grid-cols-2 gap-[2px] md:grid-cols-[repeat(auto-fill,minmax(240px,1fr))]"
      aria-busy="true"
      aria-label="Loading pieces"
    >
      {Array.from({ length: count }, (_, i) => (
        <li key={i}>
          <div className="skeleton aspect-4/5" />
          <div className="px-3 pb-4 pt-3">
            <div className="skeleton h-3 w-3/4" />
            <div className="skeleton mt-2 h-3 w-1/3" />
          </div>
        </li>
      ))}
    </ul>
  );
}
