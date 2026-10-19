import Link from 'next/link';
import { formatPrice } from '@/lib/domain/money';
import type { MakerTile, NewMaker, RailProduct } from '@/lib/queries/rails';
import { FollowButton } from '@/components/maker/FollowButton';
import { SaveButton } from '@/components/product/SaveButton';
import { Img as Image } from '@/components/ui/Img';
import { RailItem } from './Rail';
import { LongPressAdd } from '@/components/product/LongPressAdd';

function compact(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '')}k` : String(n);
}

/** The tag on a rail product image: one of one, low stock, or how many people saved it. */
export function railTag(p: RailProduct): string | null {
  if (p.productType === 'one_of_one') return 'One of one';
  if (p.productType === 'ready_to_ship' && p.totalStock > 0 && p.totalStock <= 2)
    return `${p.totalStock} left`;
  if (p.saveCount > 0) return `${compact(p.saveCount)} ${p.saveCount === 1 ? 'save' : 'saves'}`;
  return null;
}

export function RailProductCard({ product, saved }: { product: RailProduct; saved: boolean }) {
  const tag = railTag(product);
  return (
    <RailItem className="w-[168px] md:w-[300px]">
      <article className="relative">
        <LongPressAdd slug={product.slug}>
          <Link href={`/products/${product.slug}`} className="block" tabIndex={-1} aria-hidden>
            <div className="relative aspect-4/5 overflow-hidden bg-stone-light">
              {product.imageUrl && (
                <Image
                  src={product.imageUrl}
                  alt=""
                  fill
                  sizes="(min-width: 768px) 300px, 168px"
                  className="object-cover object-top"
                />
              )}
              {(product.previewOnly || tag) && (
                <span className="absolute bottom-2 left-2 bg-surface px-2 py-[3px] text-[10px] uppercase leading-4 tracking-[0.12em] text-ink">
                  {product.previewOnly ? 'Preview only' : tag}
                </span>
              )}
            </div>
          </Link>
        </LongPressAdd>
        <div className="absolute right-0 top-0">
          <SaveButton productId={product.id} saved={saved} title={product.title} />
        </div>
        <div className="pt-2.5">
          <h3 className="font-sans text-[13px] font-normal leading-snug">
            <Link href={`/products/${product.slug}`} className="line-clamp-1 hover:underline">
              {product.title}
            </Link>
          </h3>
          <p className="mt-0.5 line-clamp-1 text-[12px] text-muted-2">{product.makerName}</p>
          <p className="mt-1 text-[13px]">{formatPrice(product.priceCents)}</p>
        </div>
      </article>
    </RailItem>
  );
}

/** Accepts a Date or its JSON string (rails are cached). */
const joined = (d: Date | string) =>
  new Date(d).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });

export function NewMakerCard({ maker, following }: { maker: NewMaker; following: boolean }) {
  return (
    <RailItem className="w-[290px] md:w-[380px]">
      <article className="border border-line bg-surface">
        <Link href={`/makers/${maker.slug}`} className="block" tabIndex={-1} aria-hidden>
          <div className="relative h-[170px] overflow-hidden bg-stone-light md:h-[260px]">
            {(maker.coverUrl ?? maker.avatarUrl) && (
              <Image
                src={(maker.coverUrl ?? maker.avatarUrl)!}
                alt=""
                fill
                sizes="(min-width: 768px) 380px, 290px"
                className="object-cover"
              />
            )}
            <span className="absolute left-3 top-3 bg-ink px-2 py-[3px] text-[10px] uppercase leading-4 tracking-[0.12em] text-ground">
              New maker
            </span>
          </div>
        </Link>
        <div className="p-4 md:p-5">
          <h3 className="text-[26px] leading-tight md:text-[30px]">
            <Link href={`/makers/${maker.slug}`} className="hover:underline">
              {maker.displayName}
            </Link>
          </h3>
          <p className="mt-1 text-[11px] uppercase tracking-label text-muted-2">
            {[maker.suburb, `Joined ${joined(maker.approvedAt)}`].filter(Boolean).join(' · ')}
          </p>
          {maker.tagline && (
            <p className="mt-2 line-clamp-1 text-[13px] text-muted">{maker.tagline}</p>
          )}
          <div className="mt-4">
            <FollowButton
              makerId={maker.id}
              following={following}
              makerName={maker.displayName}
              look="rail"
            />
          </div>
          {maker.thumbs.length > 0 && (
            <ul className="mt-4 grid grid-cols-3 gap-[2px]" role="list" aria-label="Pieces">
              {maker.thumbs.map((t) => (
                <li key={t.slug}>
                  <Link
                    href={`/products/${t.slug}`}
                    className="relative block aspect-4/5 overflow-hidden bg-stone-light"
                    aria-label={t.title}
                  >
                    {t.imageUrl && (
                      <Image
                        src={t.imageUrl}
                        alt=""
                        fill
                        sizes="120px"
                        className="object-cover object-top"
                      />
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </article>
    </RailItem>
  );
}

export function MakerTileCard({ maker }: { maker: MakerTile }) {
  return (
    <RailItem className="w-[160px] md:w-[260px]">
      <Link href={`/makers/${maker.slug}`} className="group block">
        <span className="relative block aspect-4/5 overflow-hidden bg-stone-light">
          {maker.imageUrl && (
            <Image
              src={maker.imageUrl}
              alt=""
              fill
              sizes="(min-width: 768px) 260px, 160px"
              className="object-cover object-top transition duration-700 group-hover:scale-[1.02]"
            />
          )}
        </span>
        <span className="mt-2.5 block font-display text-[22px] leading-tight group-hover:underline md:text-[26px]">
          {maker.displayName}
        </span>
        <span className="mt-0.5 block text-[10px] uppercase tracking-label text-muted-2">
          {[maker.suburb, `${maker.pieceCount} ${maker.pieceCount === 1 ? 'piece' : 'pieces'}`]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </Link>
    </RailItem>
  );
}
