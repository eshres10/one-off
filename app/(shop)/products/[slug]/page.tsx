import { ShareButton } from '@/components/product/ShareButton';
import type { Metadata } from 'next';
import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getMeasurements } from '@/lib/queries/account';
import { estimateDelivery, formatDateRange } from '@/lib/domain/leadTime';
import { formatPrice } from '@/lib/domain/money';
import { productBadges } from '@/lib/domain/stock';
import { checkoutEnabled, PREVIEW_MESSAGE } from '@/lib/features';
import { shopBuyable } from '@/lib/domain/shop';
import { log } from '@/lib/log';
import { isCustomType } from '@/lib/content/returns';
import { ReturnsPolicy } from '@/components/ui/ReturnsPolicy';
import { PREVIEW_ONLY_LABEL, PREVIEW_ONLY_NOTE, isPreviewOnly } from '@/lib/domain/preview';
import {
  getProduct,
  getRelated,
  getReviews,
  getNextSlot,
  getSavedProductIds,
  recordProductView,
  watchSoldOutSizes,
} from '@/lib/queries/catalog';
import { Gallery } from '@/components/product/Gallery';
import { PurchasePanel } from '@/components/product/PurchasePanel';
import { Reviews } from '@/components/product/Reviews';
import { AskQuestionForm, Questions } from '@/components/product/Questions';
import { getQuestionsAndReviews } from '@/lib/queries/questions';
import { ProductGrid } from '@/components/product/ProductCard';
import { SaveButton } from '@/components/product/SaveButton';
import { MakerStrip } from '@/components/maker/MakerByline';
import { ProductBadgePill } from '@/components/ui/Badge';
import { Accordion, InfoPanel, SectionTitle } from '@/components/ui/Panels';
import { TrustList } from '@/components/ui/TrustList';
import { ChevronIcon } from '@/components/ui/icons';

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const p = await getProduct(params.slug);
  if (!p) return { title: 'Not found' };
  return {
    title: `${p.title} by ${p.maker.displayName}`,
    description: p.description.slice(0, 160),
  };
}

const fmtDay = (d: Date) =>
  d.toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

export default async function ProductPage({ params }: { params: { slug: string } }) {
  const user = await getSessionUser();
  let product = await getProduct(params.slug);
  let preview = false;
  // Admins and the owning maker can preview listings that aren't live yet.
  if (!product && user && (user.role === 'admin' || user.role === 'seller')) {
    const draft = await getProduct(params.slug, { includeUnapproved: true });
    if (draft && (user.role === 'admin' || draft.maker.id === user.makerId)) {
      product = draft;
      preview = true;
    }
  }
  if (!product) notFound();
  const sizes = user ? await getMeasurements(user) : null;
  const num = (v: string | null | undefined) => (v ? Number(v) : null);
  const fit = sizes
    ? {
        usualSize: sizes.usualSize,
        bust: num(sizes.bustCm),
        waist: num(sizes.waistCm),
        hips: num(sizes.hipsCm),
        height: num(sizes.heightCm),
      }
    : null;
  const [related, reviews, savedIds, qa, nextSlot] = await Promise.all([
    getRelated(product.id, product.maker.id, product.category, product.colours),
    getReviews({ productId: product.id }, 3),
    getSavedProductIds(user?.id ?? null),
    getQuestionsAndReviews(product.id),
    getNextSlot(product.id),
  ]);
  const questions = qa.filter((e) => e.kind === 'question');
  const isMaker = Boolean(user && user.id === product.maker.userId);

  const h = headers();
  const viewerKey =
    user?.id ??
    createHash('sha256')
      .update(`${h.get('x-forwarded-for') ?? ''}|${h.get('user-agent') ?? ''}`)
      .digest('hex')
      .slice(0, 24);
  if (!preview && user?.id !== product.maker.userId) {
    recordProductView(product.id, product.maker.id, viewerKey).catch((err) =>
      log.warn({ err }, 'view tracking failed'),
    );
    if (user)
      watchSoldOutSizes(user, product.id).catch((err) => log.warn({ err }, 'size watch failed'));
  }

  const m = product.maker;
  const estimate = estimateDelivery({
    productType: product.productType,
    leadTimeDays: product.leadTimeDays,
    dispatchDays: m.dispatchDays,
  });
  const badges = productBadges(product.productType, product.variants);
  const primaryBadge = badges.find((b) => b === 'sold_out') ?? badges[0]!;
  const totalStock = product.variants.reduce((s, v) => s + Math.max(0, v.stockQuantity), 0);
  const shippingText = `Shipping ${m.freeShippingOverCents ? `free over ${formatPrice(m.freeShippingOverCents)}, otherwise ` : ''}${formatPrice(m.shippingStandardCents)} [placeholder], shown before you pay.`;
  const custom = isCustomType(product.productType);
  const previewOnly = isPreviewOnly(product.tags);
  const saved = savedIds.has(product.id);
  const sale = shopBuyable(m);
  const modelLine = product.modelHeightCm
    ? `Model is ${product.modelHeightCm} cm and wears size ${product.modelSizeWorn ?? '—'}.`
    : null;

  const typeLine =
    product.productType === 'made_to_order'
      ? `Made to order — production takes ${product.leadTimeDays} days${nextSlot ? ` · Next slot: ${nextSlot}` : ''}`
      : totalStock === 0
        ? 'Sold out'
        : product.productType === 'one_of_one'
          ? 'One of one — only this piece exists'
          : `Ready to ship — ${totalStock} in stock`;
  const dateLine =
    totalStock === 0 && product.productType !== 'made_to_order'
      ? 'Follow the maker to hear about restocks.'
      : `Dispatch by ${fmtDay(estimate.dispatchBy)} · Estimated delivery ${formatDateRange(estimate.deliveryFrom, estimate.deliveryTo)}`;

  const reviewsBlock = (id: string) => (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id={id} className="text-[44px] leading-none md:text-[56px]">
            Reviews
          </h2>
          <p className="mt-2 text-[13px] text-muted">
            {m.reviewCount > 0
              ? `★ ${m.rating.toFixed(1)} from ${m.reviewCount} buyers of ${m.displayName} pieces. `
              : ''}
            Only buyers with delivered orders can review.
          </p>
        </div>
        <Link
          href={`/makers/${m.slug}#reviews`}
          className="text-[11px] uppercase tracking-label underline underline-offset-[6px]"
        >
          All reviews
        </Link>
      </div>
      <Reviews reviews={reviews} emptyText="No reviews for this piece yet." />
    </>
  );

  return (
    // Phones: the site header steps aside (data-immersive), the photos stay fixed at the top and
    // the content card slides up over them. Desktop: the gallery stays pinned while the details
    // column scrolls, then releases when it ends.
    <div className="pb-28 max-md:-mt-[var(--header-h)] md:pb-0" data-immersive>
      {preview && (
        <p
          className="relative z-[1] bg-stone-light px-4 py-2 text-center text-[11px] uppercase tracking-label"
          role="status"
        >
          Preview — this listing isn’t visible to shoppers yet
        </p>
      )}
      <div
        className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+12px)] z-[5] flex items-center justify-between md:hidden"
        data-testid="phone-product-actions"
      >
        <Link
          href="/"
          aria-label="Back to Discover"
          className="glass-chip flex h-11 w-11 items-center justify-center"
        >
          <ChevronIcon dir="left" width={18} height={18} />
        </Link>
        <div className="flex gap-2">
          <ShareButton title={product.title} className="glass-chip" />
          <SaveButton productId={product.id} saved={saved} title={product.title} boxed />
        </div>
      </div>
      <div className="md:grid md:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:flex lg:items-start">
        <div
          className="follow-header sticky top-0 z-0 h-[max(480px,66vh)] md:top-[var(--header-offset)] md:h-auto md:self-start lg:w-[59%] lg:shrink-0"
          data-testid="product-gallery"
        >
          <Gallery
            images={product.images}
            title={product.title}
            overlay={
              <div className="absolute right-3 top-3 hidden md:flex">
                <SaveButton productId={product.id} saved={saved} title={product.title} boxed />
              </div>
            }
          />
        </div>

        <div
          className="relative z-[1] -mt-7 bg-ground px-4 pt-4 shadow-[0_-14px_32px_rgba(17,17,17,0.14)] md:mt-0 md:px-10 md:pt-8 md:shadow-none lg:min-w-0 lg:flex-1 lg:px-12"
          data-testid="product-details"
        >
          <span
            aria-hidden
            className="mx-auto -mt-1 mb-3 block h-1 w-9 rounded-circle bg-line-strong md:hidden"
          />
          <nav
            aria-label="Breadcrumb"
            className="hidden text-[11px] uppercase tracking-label text-muted-2 md:block"
          >
            <Link href="/" className="hover:underline">
              Discover
            </Link>{' '}
            /{' '}
            <Link href={`/?category=${product.category}`} className="hover:underline">
              {product.category}
            </Link>
          </nav>
          <div className="md:mt-5">
            <MakerStrip maker={m} />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {previewOnly && (
              <span
                className="inline-flex items-center bg-ink px-2 py-[3px] text-[10px] uppercase leading-4 tracking-[0.14em] text-ground"
                data-testid="preview-only-label"
              >
                {PREVIEW_ONLY_LABEL}
              </span>
            )}
            <ProductBadgePill badge={primaryBadge} outlined />
          </div>
          <h1 className="mt-3 text-[40px] leading-[0.95] md:text-[clamp(44px,4vw,58px)]">
            {product.title}
          </h1>
          <p className="mt-3 text-[15px]">{formatPrice(product.priceCents)}</p>

          <InfoPanel className="mt-5">
            <span data-testid="availability" className="block">
              <span className="block font-normal text-ink">{typeLine}</span>
              <span className="block text-muted">{dateLine}</span>
              {product.madeToOrderOptions && (
                <span className="mt-1 block text-muted">{product.madeToOrderOptions}</span>
              )}
            </span>
          </InfoPanel>

          <div className="mt-6">
            <PurchasePanel
              productId={product.id}
              productSlug={product.slug}
              productType={product.productType}
              priceCents={product.priceCents}
              colours={product.colours}
              variants={product.variants}
              askHref={`/products/${product.slug}`}
              requestHref={
                m.customCommissionsEnabled
                  ? `/makers/${m.slug}/commission?product=${product.id}`
                  : undefined
              }
              modelLine={modelLine}
              savedSizes={fit}
              checkoutEnabled={(await checkoutEnabled()) && !previewOnly && sale.ok}
              previewMessage={
                previewOnly
                  ? PREVIEW_ONLY_NOTE
                  : !sale.ok
                    ? [sale.message, sale.kind === 'away' ? m.holidayNote : null]
                        .filter(Boolean)
                        .join(' ')
                    : PREVIEW_MESSAGE
              }
              disabledLabel={previewOnly ? 'Preview only' : sale.ok ? 'Launching soon' : sale.label}
            />
          </div>

          <div className="mt-6">
            <TrustList shipsFrom={`${m.displayName}, ${m.city}`} shipping={shippingText} />
          </div>

          <div className="mt-2">
            <Accordion id="returns" title="Returns" open={custom}>
              <ReturnsPolicy productType={product.productType} link testId="returns-row" />
            </Accordion>
            <Accordion title="Description" open>
              <p className="whitespace-pre-line">{product.description}</p>
            </Accordion>
            <Accordion title="Garment details" open>
              <dl className="grid grid-cols-[110px_1fr] gap-y-1.5">
                <dt className="text-muted-2">Fabric</dt>
                <dd>{product.fabricComposition}</dd>
                <dt className="text-muted-2">Care</dt>
                <dd>{product.careInstructions}</dd>
                <dt className="text-muted-2">Made in</dt>
                <dd>
                  {m.city}, {product.countryOfMaking}
                </dd>
                {modelLine && (
                  <>
                    <dt className="text-muted-2">Model</dt>
                    <dd>
                      {product.modelHeightCm} cm, wears size {product.modelSizeWorn}
                    </dd>
                  </>
                )}
              </dl>
            </Accordion>
            <Accordion id="garment-measurements" title="Garment measurements">
              {product.measurements.length ? (
                <table className="w-full text-left">
                  <caption className="mb-2 text-left text-[12px] text-muted-2">
                    Measured flat
                    {product.measurements[0]?.size
                      ? ` on size ${product.measurements[0].size}`
                      : ''}
                    , in centimetres
                  </caption>
                  <tbody>
                    {product.measurements.map((ms) => (
                      <tr key={ms.name} className="border-t border-line">
                        <th scope="row" className="py-2 font-light">
                          {ms.name}
                        </th>
                        <td className="py-2 text-right tabular-nums">{ms.valueCm} cm</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>Ask the maker for exact measurements.</p>
              )}
            </Accordion>
            <Accordion title="Shipping">
              <p>{shippingText}</p>
            </Accordion>
          </div>
          <section aria-labelledby="reviews-title-desktop" className="mt-16 hidden lg:block">
            {reviewsBlock('reviews-title-desktop')}
          </section>
        </div>
      </div>

      <div className="relative z-[1] bg-ground pt-20">
        {/* On desktop, reviews sit in the details column (above) so the gallery stays pinned. */}
        <section aria-labelledby="reviews-title" className="container-page lg:hidden">
          {reviewsBlock('reviews-title')}
        </section>

        <section
          id="questions"
          aria-labelledby="questions-title"
          className="container-page mt-20 scroll-mt-[calc(var(--header-h)+16px)]"
        >
          <h2 id="questions-title" className="text-[44px] leading-none md:text-[56px]">
            Questions
          </h2>
          <p className="mb-6 mt-2 text-[13px] text-muted">
            Asked in public and answered by {m.displayName}. For anything personal, ask the maker
            privately.
          </p>
          <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Questions entries={questions} slug={product.slug} canReply={isMaker} />
            <div className="md:max-w-md">
              <AskQuestionForm
                productId={product.id}
                slug={product.slug}
                makerName={m.displayName}
                signedIn={Boolean(user)}
                isMaker={isMaker}
              />
            </div>
          </div>
        </section>

        {related.fromMaker.length > 0 && (
          <section aria-labelledby="more-maker" className="mt-20">
            <div className="container-page">
              <SectionTitle>
                <span id="more-maker">More from {m.displayName}</span>
              </SectionTitle>
            </div>
            <ProductGrid products={related.fromMaker} savedIds={savedIds} priorityCount={0} />
          </section>
        )}
        {related.similar.length > 0 && (
          <section aria-labelledby="similar" className="mt-20">
            <div className="container-page">
              <SectionTitle>
                <span id="similar">You may also like</span>
              </SectionTitle>
            </div>
            <ProductGrid products={related.similar} savedIds={savedIds} priorityCount={0} />
          </section>
        )}
      </div>
    </div>
  );
}
