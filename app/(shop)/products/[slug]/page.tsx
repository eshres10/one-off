import type { Metadata } from 'next';
import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { estimateDelivery, formatDateRange } from '@/lib/domain/leadTime';
import { formatPrice } from '@/lib/domain/money';
import { productBadges } from '@/lib/domain/stock';
import { log } from '@/lib/log';
import {
  getProduct,
  getRelated,
  getReviews,
  getSavedProductIds,
  recordProductView,
} from '@/lib/queries/catalog';
import { Gallery } from '@/components/product/Gallery';
import { PurchasePanel } from '@/components/product/PurchasePanel';
import { TrustBlock } from '@/components/product/TrustBlock';
import { Reviews } from '@/components/product/Reviews';
import { ProductGrid } from '@/components/product/ProductCard';
import { SaveButton } from '@/components/product/SaveButton';
import { MakerByline } from '@/components/maker/MakerByline';
import { ProductBadgePill } from '@/components/ui/Badge';
import { NeedleIcon } from '@/components/ui/icons';

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

function Section({
  id,
  title,
  children,
  open = false,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
  open?: boolean;
}) {
  return (
    <details id={id} open={open} className="group border-b border-stone/70 py-4">
      <summary className="flex cursor-pointer list-none items-center justify-between text-[15px] font-medium [&::-webkit-details-marker]:hidden">
        {title}
        <span
          aria-hidden
          className="text-xl leading-none text-ink-muted transition group-open:rotate-45"
        >
          +
        </span>
      </summary>
      <div className="mt-3 text-sm leading-relaxed text-ink-soft">{children}</div>
    </details>
  );
}

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
  const [related, reviews, savedIds] = await Promise.all([
    getRelated(product.id, product.maker.id, product.category, product.colours),
    getReviews({ productId: product.id }),
    getSavedProductIds(user?.id ?? null),
  ]);

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
  }

  const m = product.maker;
  const estimate = estimateDelivery({
    productType: product.productType,
    leadTimeDays: product.leadTimeDays,
    dispatchDays: m.dispatchDays,
  });
  const badges = productBadges(product.productType, product.variants);
  const totalStock = product.variants.reduce((s, v) => s + Math.max(0, v.stockQuantity), 0);
  const shippingText = `${m.freeShippingOverCents ? `Free over ${formatPrice(m.freeShippingOverCents)}, otherwise ` : ''}${formatPrice(
    m.shippingStandardCents,
  )} tracked from ${m.city}. Estimated delivery ${formatDateRange(estimate.deliveryFrom, estimate.deliveryTo)}.`;
  const returnsText = product.returnPolicy ?? m.returnPolicy;
  const askHref = `/products/${product.slug}/ask`;

  return (
    <div className="container-page pb-28 pt-4 sm:pb-0 sm:pt-8">
      {preview && (
        <p className="mb-4 rounded-lg bg-clay-light px-3 py-2 text-sm text-clay" role="status">
          Preview — this listing isn’t visible to shoppers yet.
        </p>
      )}
      <nav aria-label="Breadcrumb" className="mb-4 text-xs text-ink-muted">
        <Link href="/" className="hover:underline">
          Discover
        </Link>{' '}
        /{' '}
        <Link href={`/makers/${m.slug}`} className="hover:underline">
          {m.displayName}
        </Link>{' '}
        / <span aria-current="page">{product.title}</span>
      </nav>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-14">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <Gallery images={product.images} title={product.title} />
        </div>

        <div>
          <MakerByline maker={m} />
          <div className="mt-5 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl leading-tight sm:text-4xl">{product.title}</h1>
              <p className="mt-2 text-xl">{formatPrice(product.priceCents)}</p>
            </div>
            <SaveButton
              productId={product.id}
              saved={savedIds.has(product.id)}
              title={product.title}
              className="border border-stone"
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {badges.map((b) => (
              <ProductBadgePill key={b} badge={b} className="border border-stone/70" />
            ))}
          </div>

          <div
            className="mt-5 rounded-2xl bg-stone-light/70 p-4 text-sm"
            data-testid="availability"
          >
            {product.productType === 'made_to_order' ? (
              <>
                <p className="font-medium">Made to order in {product.leadTimeDays} days</p>
                <p className="mt-1 text-ink-soft">
                  Cut and sewn for you after you order. Expected delivery{' '}
                  {formatDateRange(estimate.deliveryFrom, estimate.deliveryTo)}.
                </p>
                {product.madeToOrderOptions && (
                  <p className="mt-1 text-ink-soft">{product.madeToOrderOptions}</p>
                )}
              </>
            ) : (
              <>
                <p className="font-medium">
                  {totalStock === 0
                    ? 'Sold out'
                    : product.productType === 'one_of_one'
                      ? 'One of one — only this piece exists'
                      : `Ready to ship · ${totalStock} in stock`}
                </p>
                {totalStock > 0 && (
                  <p className="mt-1 text-ink-soft">
                    Dispatches within {m.dispatchDays} business day{m.dispatchDays === 1 ? '' : 's'}
                    . Estimated delivery{' '}
                    {formatDateRange(estimate.deliveryFrom, estimate.deliveryTo)}.
                  </p>
                )}
              </>
            )}
          </div>

          <div className="mt-6">
            <PurchasePanel
              productId={product.id}
              productSlug={product.slug}
              productType={product.productType}
              priceCents={product.priceCents}
              colours={product.colours}
              variants={product.variants}
              askHref={askHref}
            />
          </div>

          <div className="mt-6">
            <TrustBlock shipping={shippingText} returns={returnsText} />
          </div>

          <div className="mt-6">
            <Section title="Description" open>
              <p className="whitespace-pre-line">{product.description}</p>
            </Section>
            <Section id="size-and-fit" title="Size & fit">
              {product.measurements.length > 0 && (
                <table className="mb-3 w-full text-left text-sm">
                  <caption className="mb-2 text-left text-xs text-ink-muted">
                    Garment measurements
                    {product.measurements[0]?.size ? ` (AU ${product.measurements[0].size})` : ''},
                    in centimetres
                  </caption>
                  <tbody>
                    {product.measurements.map((ms) => (
                      <tr key={ms.name} className="border-t border-stone/60">
                        <th scope="row" className="py-1.5 font-normal">
                          {ms.name}
                        </th>
                        <td className="py-1.5 text-right tabular-nums">{ms.valueCm} cm</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {product.modelHeightCm && (
                <p>
                  Model is {product.modelHeightCm} cm and wears AU {product.modelSizeWorn ?? '—'}.
                </p>
              )}
            </Section>
            <Section title="Fabric & care">
              <p>
                <span className="font-medium text-ink">Fabric:</span> {product.fabricComposition}
              </p>
              <p className="mt-1">
                <span className="font-medium text-ink">Care:</span> {product.careInstructions}
              </p>
            </Section>
            <Section title="Where it’s made">
              <p>
                Made in {product.countryOfMaking} by {m.displayName}, {m.location}.{' '}
                {m.completedOrders} orders completed.
              </p>
            </Section>
          </div>

          {m.customCommissionsEnabled && (
            <Link
              href={`/makers/${m.slug}/commission?product=${product.id}`}
              className="mt-6 flex items-center gap-3 rounded-2xl border border-dashed border-stone-dark p-4 text-sm hover:border-ink"
            >
              <NeedleIcon className="shrink-0" />
              <span>
                <span className="block font-medium">Request something similar</span>
                <span className="text-ink-muted">
                  Commission a custom piece from {m.displayName} (concierge pilot).
                </span>
              </span>
            </Link>
          )}
        </div>
      </div>

      <section aria-labelledby="reviews-title" className="mt-16 max-w-3xl">
        <h2 id="reviews-title" className="text-2xl">
          Reviews
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Reviews come only from buyers whose orders were delivered.
        </p>
        <div className="mt-2">
          <Reviews reviews={reviews} emptyText="No reviews for this piece yet." />
        </div>
      </section>

      {related.fromMaker.length > 0 && (
        <section aria-labelledby="more-maker" className="mt-16">
          <div className="mb-5 flex items-end justify-between">
            <h2 id="more-maker" className="text-2xl">
              More from {m.displayName}
            </h2>
            <Link href={`/makers/${m.slug}`} className="text-sm underline underline-offset-4">
              View all
            </Link>
          </div>
          <ProductGrid products={related.fromMaker} savedIds={savedIds} priorityCount={0} />
        </section>
      )}
      {related.similar.length > 0 && (
        <section aria-labelledby="similar" className="mt-16">
          <h2 id="similar" className="mb-5 text-2xl">
            You might also love
          </h2>
          <ProductGrid products={related.similar} savedIds={savedIds} priorityCount={0} />
        </section>
      )}
    </div>
  );
}
