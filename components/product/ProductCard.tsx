import { Img as Image } from '@/components/ui/Img';
import Link from 'next/link';
import type { ProductCard as Card } from '@/lib/queries/catalog';
import { formatPrice } from '@/lib/domain/money';
import { ProductBadgePill } from '@/components/ui/Badge';
import { SaveButton } from './SaveButton';

export function ProductCard({
  product,
  saved,
  priority = false,
}: {
  product: Card;
  saved: boolean;
  priority?: boolean;
}) {
  const soldOut = product.badges.includes('sold_out');
  const badge =
    product.badges.find((b) => b === 'sold_out' || b === 'low_stock') ?? product.badges[0];
  return (
    <article className="group relative" data-testid="product-card">
      <Link
        href={`/products/${product.slug}`}
        className="block rounded-xl focus-visible:ring-offset-4"
      >
        <div className="relative aspect-4/5 overflow-hidden rounded-xl bg-stone-light">
          {product.imageUrl && (
            <Image
              src={product.imageUrl}
              alt={product.imageAlt ?? product.title}
              fill
              priority={priority}
              sizes="(min-width: 1280px) 22vw, (min-width: 768px) 30vw, 48vw"
              className={`object-cover transition duration-500 group-hover:scale-[1.03] ${soldOut ? 'opacity-60' : ''}`}
            />
          )}
          {badge && (
            <span className="absolute bottom-2 left-2">
              <ProductBadgePill badge={badge} />
            </span>
          )}
        </div>
        <div className="mt-2.5 px-0.5">
          <h3 className="line-clamp-1 font-sans text-[14px] font-medium leading-snug sm:text-[15px]">
            {product.title}
          </h3>
          <p className="mt-0.5 line-clamp-1 text-[13px] text-ink-muted">
            {product.makerName}
            {product.makerCity ? ` · ${product.makerCity}` : ''}
          </p>
          <p className="mt-1 text-[14px] font-medium">{formatPrice(product.priceCents)}</p>
        </div>
      </Link>
      <div className="absolute right-2 top-2">
        <SaveButton productId={product.id} saved={saved} title={product.title} />
      </div>
    </article>
  );
}

export function ProductGrid({
  products,
  savedIds,
  priorityCount = 4,
}: {
  products: Card[];
  savedIds: Set<string>;
  priorityCount?: number;
}) {
  return (
    <ul
      className="grid grid-cols-2 gap-x-3 gap-y-7 sm:gap-x-4 md:grid-cols-3 lg:grid-cols-4"
      role="list"
    >
      {products.map((p, i) => (
        <li key={p.id}>
          <ProductCard product={p} saved={savedIds.has(p.id)} priority={i < priorityCount} />
        </li>
      ))}
    </ul>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <ul
      className="grid grid-cols-2 gap-x-3 gap-y-7 sm:gap-x-4 md:grid-cols-3 lg:grid-cols-4"
      aria-busy="true"
      aria-label="Loading pieces"
    >
      {Array.from({ length: count }, (_, i) => (
        <li key={i}>
          <div className="skeleton aspect-4/5 rounded-xl" />
          <div className="skeleton mt-3 h-3.5 w-3/4 rounded" />
          <div className="skeleton mt-2 h-3 w-1/2 rounded" />
          <div className="skeleton mt-2 h-3.5 w-1/4 rounded" />
        </li>
      ))}
    </ul>
  );
}
