import Link from 'next/link';
import { z } from 'zod';
import { requireSeller } from '@/lib/auth/session';
import { isPreviewOnly } from '@/lib/domain/preview';
import { getProduct } from '@/lib/queries/catalog';
import { getQuestionsAndReviews, getSaveCount } from '@/lib/queries/questions';
import { listPieces } from '@/lib/services/studio-listings';
import { ListingCard } from '@/components/studio/ListingCard';
import { RouteSheet } from '@/components/studio/RouteSheet';
import { QuickViewContent } from '@/components/quickview/QuickViewContent';
import { PlusIcon } from '@/components/ui/icons';

export const metadata = { title: 'Listings · Studio' };

export default async function StudioListingsPage({
  searchParams,
}: {
  searchParams: { preview?: string };
}) {
  const seller = await requireSeller();
  const pieces = await listPieces(seller);
  const previewId = z.string().uuid().safeParse(searchParams.preview);
  const previewSlug = previewId.success
    ? pieces.find((p) => p.id === previewId.data)?.slug
    : undefined;
  const product = previewSlug ? await getProduct(previewSlug, { includeUnapproved: true }) : null;
  const [saveCount, qa] = product
    ? await Promise.all([getSaveCount(product.id), getQuestionsAndReviews(product.id)])
    : [0, []];

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[40px] leading-none md:text-[56px]">Listings</h1>
          <p className="mt-2 text-[13px] text-muted">
            {pieces.filter((p) => p.status === 'approved').length} live ·{' '}
            {(() => {
              const n = pieces.filter((p) => p.status === 'draft' || p.status === 'pending').length;
              return `${n} ${n === 1 ? 'draft' : 'drafts'}`;
            })()}{' '}
            · {pieces.filter((p) => p.status === 'archived').length} hidden
          </p>
        </div>
        <Link
          href="/studio/listings/new"
          className="glass-dark hidden min-h-[48px] items-center gap-2 px-5 text-[11px] uppercase tracking-[0.18em] md:flex"
          data-testid="add-piece"
        >
          <PlusIcon width={14} height={14} /> Add a piece
        </Link>
      </div>
      <ul className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4" role="list">
        <li className="md:hidden">
          <Link
            href="/studio/listings/new"
            className="flex aspect-4/5 flex-col items-center justify-center gap-2 border border-dashed border-line-strong text-[12px] text-muted"
          >
            <PlusIcon width={20} height={20} />
            Add a piece
          </Link>
        </li>
        {pieces.map((p) => (
          <li key={p.id}>
            <ListingCard piece={p} />
          </li>
        ))}
      </ul>
      {product && (
        <RouteSheet
          closeHref="/studio/listings"
          variant="center"
          width={1096}
          testId="listing-preview"
          labelledBy="qv-title"
          title={
            <p className="text-[11px] uppercase tracking-label text-muted-2">
              Preview · how buyers see it
            </p>
          }
        >
          <div className="h-[min(760px,78vh)] overflow-hidden border border-line">
            <QuickViewContent
              product={product}
              saved={false}
              saveCount={saveCount}
              following={false}
              qa={qa}
              signedIn
              isMaker
              checkoutOn={false}
              previewOnly={isPreviewOnly(product.tags)}
            />
          </div>
        </RouteSheet>
      )}
    </div>
  );
}
