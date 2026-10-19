'use client';

import Link from 'next/link';
import { formatPrice } from '@/lib/domain/money';
import { EMPTY, discoverHref } from '@/lib/discover/params';
import type { DiscoverEdit, DiscoverMaker, DiscoverPiece } from '@/lib/queries/discover';
import { FollowButton } from '@/components/maker/FollowButton';
import { SaveButton } from '@/components/product/SaveButton';
import { Img as Image } from '@/components/ui/Img';

export const FALLBACK_RATIO = 1.25;
/** Space under a piece's image (name, maker line, tag) relative to column width. */
export const PIECE_TEXT = 0.3;

export function pieceRatio(p: DiscoverPiece) {
  return p.width && p.height ? p.height / p.width : FALLBACK_RATIO;
}

function statusTag(p: DiscoverPiece): string | null {
  if (p.productType === 'made_to_order') return 'Made to order';
  if (p.productType === 'one_of_one') return 'One of one';
  if (p.totalStock > 0 && p.totalStock <= 2) return `${p.totalStock} left`;
  return null;
}

export function PieceCard({
  piece,
  saved,
  priority = false,
}: {
  piece: DiscoverPiece;
  saved: boolean;
  priority?: boolean;
}) {
  const href = `/products/${piece.slug}`;
  const tag = statusTag(piece);
  const w = piece.width ?? 800;
  const h = piece.height ?? Math.round(800 * FALLBACK_RATIO);
  return (
    <article className="group" data-testid="discover-piece">
      <div className="relative overflow-hidden bg-stone-light">
        <Link href={href} data-quickview tabIndex={-1} aria-hidden className="block">
          <Image
            src={piece.imageUrl ?? '/seed/hero-linen-suit.jpg'}
            alt=""
            width={w}
            height={h}
            priority={priority}
            sizes="(min-width: 1280px) 20vw, (min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
            className="h-auto w-full transition duration-500 group-hover:scale-[1.03]"
          />
        </Link>
        {piece.previewOnly && (
          <span className="pointer-events-none absolute left-2 top-2 bg-ink px-2 py-[3px] text-[10px] uppercase leading-4 tracking-[0.14em] text-ground">
            Preview only
          </span>
        )}
        <div className="absolute right-2 top-2 transition-opacity lg:opacity-0 lg:focus-within:opacity-100 lg:group-hover:opacity-100">
          <SaveButton productId={piece.id} saved={saved} title={piece.title} boxed />
        </div>
        <Link
          href={href}
          data-quickview
          className="glass-chip absolute bottom-2 left-2 hidden min-h-[44px] items-center px-3 text-[10px] uppercase tracking-label opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100 lg:flex"
        >
          Quick view<span className="sr-only">: {piece.title}</span>
        </Link>
      </div>
      <div className="pb-1 pt-2">
        {/* The name always opens the full product page. */}
        <a href={href} className="line-clamp-1 py-0.5 text-[13px] text-ink hover:underline">
          {piece.title}
        </a>
        <p className="text-[12px] text-muted-2">
          {piece.makerName} · {formatPrice(piece.priceCents)}
        </p>
        {tag && (
          <p className="mt-1 inline-block border border-line-strong px-1.5 py-[1px] text-[10px] uppercase tracking-[0.12em] text-muted">
            {tag}
          </p>
        )}
      </div>
    </article>
  );
}

export function EditCard({ edit }: { edit: DiscoverEdit }) {
  return (
    <Link
      href={discoverHref({ ...EMPTY, edit: edit.slug })}
      className="group relative block aspect-4/5 overflow-hidden bg-stone-light text-ground"
      data-testid="discover-edit"
    >
      <Image
        src={edit.image}
        alt=""
        fill
        sizes="(min-width: 1024px) 25vw, 50vw"
        className="object-cover transition duration-[600ms] group-hover:scale-[1.03]"
      />
      <span
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent"
      />
      <span className="absolute inset-x-0 bottom-0 p-4">
        <span className="block font-display text-[26px] leading-[1.05]">{edit.title}</span>
        <span className="mt-2 block text-[10px] uppercase tracking-label">Shop the edit →</span>
      </span>
    </Link>
  );
}

export function MakerCard({ maker, following }: { maker: DiscoverMaker; following: boolean }) {
  return (
    <article className="bg-stone-light p-4" data-testid="discover-maker">
      <div className="flex items-center gap-3">
        <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-circle bg-line">
          {maker.avatarUrl && (
            <Image src={maker.avatarUrl} alt="" fill sizes="56px" className="object-cover" />
          )}
        </span>
        <div className="min-w-0">
          <Link
            href={`/makers/${maker.slug}`}
            className="block font-display text-[24px] leading-tight hover:underline"
          >
            {maker.displayName}
          </Link>
          {maker.suburb && <p className="text-[12px] text-muted-2">{maker.suburb}</p>}
        </div>
      </div>
      {maker.thumbs.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-[2px]" role="list" aria-label="Pieces">
          {maker.thumbs.map((t) => (
            <li key={t.slug}>
              <Link
                href={`/products/${t.slug}`}
                className="relative block aspect-4/5 overflow-hidden bg-line"
                aria-label={`A piece by ${maker.displayName}`}
              >
                {t.imageUrl && (
                  <Image
                    src={t.imageUrl}
                    alt=""
                    fill
                    sizes="90px"
                    className="object-cover object-top"
                  />
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3">
        <FollowButton
          makerId={maker.id}
          following={following}
          makerName={maker.displayName}
          look="rail"
        />
      </div>
    </article>
  );
}
