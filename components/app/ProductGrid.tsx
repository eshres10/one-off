import Link from 'next/link';
import type { ProductCard } from '@/lib/queries/catalog';
import { formatPrice } from '@/lib/domain/money';
import { Img as Image } from '@/components/ui/Img';
import { Heart } from './Heart';

const TYPE: Record<string, string> = {
  ready_to_ship: 'Ready to ship',
  made_to_order: 'Made to order',
  one_of_one: 'One of one',
};

/** One piece in the app's edge-to-edge grid: a 4:5 photo with a heart, then price · type · maker. */
export function PhoneProductTile({
  product,
  saved,
  priority = false,
}: {
  product: ProductCard;
  saved: boolean;
  priority?: boolean;
}) {
  const soldOut = product.badges.includes('sold_out');
  return (
    <article className="relative" data-testid="phone-tile">
      <Link href={`/products/${product.slug}`} className="block" aria-label={product.title}>
        <span className="relative block aspect-4/5 overflow-hidden bg-stone">
          {product.imageUrl && (
            <Image
              src={product.imageUrl}
              alt=""
              fill
              priority={priority}
              sizes="50vw"
              className={`object-cover object-top ${soldOut ? 'opacity-60' : ''}`}
            />
          )}
          {soldOut && (
            <span className="absolute left-2 top-2 rounded-pill bg-ground/90 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]">
              Sold
            </span>
          )}
        </span>
        <span className="block px-2.5 pb-4 pt-2">
          <span className="block text-[14px] font-medium">{formatPrice(product.priceCents)}</span>
          <span className="block truncate text-[12px] text-muted">
            {TYPE[product.productType]} · {product.title}
          </span>
          <span className="block truncate text-[12px] text-muted-2">{product.makerName}</span>
        </span>
      </Link>
      <span className="absolute right-1 top-1">
        <Heart productId={product.id} saved={saved} title={product.title} />
      </span>
    </article>
  );
}

export function PhoneProductGrid({
  products,
  savedIds,
  priorityCount = 2,
}: {
  products: ProductCard[];
  savedIds: Set<string>;
  priorityCount?: number;
}) {
  return (
    <ul className="grid grid-cols-2 gap-[2px]" role="list" data-testid="phone-grid">
      {products.map((p, i) => (
        <li key={p.id}>
          <PhoneProductTile product={p} saved={savedIds.has(p.id)} priority={i < priorityCount} />
        </li>
      ))}
    </ul>
  );
}

/** Loading placeholders, the same shape as the tiles. */
export function PhoneGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-[2px]" role="list" aria-hidden data-testid="phone-skeleton">
      {Array.from({ length: count }).map((_, i) => (
        <li key={i}>
          <div className="skeleton-shimmer aspect-4/5" />
          <div className="space-y-2 px-2.5 pb-4 pt-2">
            <div className="skeleton-shimmer h-3 w-14" />
            <div className="skeleton-shimmer h-3 w-28" />
          </div>
        </li>
      ))}
    </ul>
  );
}
