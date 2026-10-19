import { getSessionUser } from '@/lib/auth/session';
import { isPreviewOnly } from '@/lib/domain/preview';
import { checkoutEnabled } from '@/lib/features';
import { log } from '@/lib/log';
import {
  getProduct,
  getSavedProductIds,
  isFollowing,
  recordProductView,
} from '@/lib/queries/catalog';
import { getQuestionsAndReviews, getSaveCount } from '@/lib/queries/questions';
import { QuickViewContent } from '@/components/quickview/QuickViewContent';

/** Product quick view: /products/[slug] opened from a card on desktop. */
export default async function QuickViewPage({ params }: { params: { slug: string } }) {
  const user = await getSessionUser();
  const product = await getProduct(decodeURIComponent(params.slug));
  if (!product)
    return (
      <div className="flex h-full items-center justify-center p-10 text-center">
        <h2 id="qv-title" className="text-[32px]">
          This piece isn’t available any more
        </h2>
      </div>
    );
  const [saved, following, saveCount, qa] = await Promise.all([
    getSavedProductIds(user?.id ?? null),
    isFollowing(user?.id ?? null, product.maker.id),
    getSaveCount(product.id),
    getQuestionsAndReviews(product.id),
  ]);
  const isMaker = Boolean(user && user.id === product.maker.userId);
  if (user && !isMaker)
    recordProductView(product.id, product.maker.id, user.id).catch((err) =>
      log.warn({ err }, 'view tracking failed'),
    );
  return (
    <QuickViewContent
      product={product}
      saved={saved.has(product.id)}
      saveCount={saveCount}
      following={following}
      qa={qa}
      signedIn={Boolean(user)}
      isMaker={isMaker}
      checkoutOn={checkoutEnabled()}
      previewOnly={isPreviewOnly(product.tags)}
    />
  );
}
