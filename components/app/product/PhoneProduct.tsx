import Link from 'next/link';
import type { ProductDetail } from '@/lib/queries/catalog';
import type { ProductCard } from '@/lib/queries/catalog';
import type { StoryForPage } from '@/lib/queries/story';
import type { SavedFit } from '@/components/product/CustomMeasurements';
import { formatPrice } from '@/lib/domain/money';
import { SITE } from '@/lib/site/config';
import { Img as Image } from '@/components/ui/Img';
import { ChevronIcon } from '@/components/ui/icons';
import { FollowButton } from '@/components/maker/FollowButton';
import { ReturnsPolicy } from '@/components/ui/ReturnsPolicy';
import { PhoneGallery } from './PhoneGallery';
import { PhoneBuy } from './PhoneBuy';

const TYPE: Record<string, string> = {
  ready_to_ship: 'Ready to ship',
  made_to_order: 'Made to order',
  one_of_one: 'One of one',
};

function Row({
  title,
  children,
  open = false,
  testId,
  id,
}: {
  title: string;
  children: React.ReactNode;
  open?: boolean;
  testId?: string;
  id?: string;
}) {
  return (
    <details className="group border-t border-line" open={open} data-testid={testId} id={id}>
      <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between text-[15px] [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronIcon
          dir="down"
          width={16}
          height={16}
          className="transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="pb-4 text-[13px] text-muted">{children}</div>
    </details>
  );
}

/**
 * The phone product screen: photos, the maker row, title and price, the size row, the story,
 * fabric and delivery rows, more from the maker and the sticky buy bar.
 */
export function PhoneProduct({
  product,
  saved,
  savedFit,
  following,
  story,
  more,
  savedIds,
  typeLine,
  dateLine,
  shippingText,
  canBuy,
  disabledLabel,
  soldOut,
  signedIn,
  makeToOrder = null,
}: {
  product: ProductDetail;
  saved: boolean;
  savedFit: SavedFit | null;
  following: boolean;
  story: StoryForPage | null;
  more: ProductCard[];
  savedIds: Set<string>;
  typeLine: string;
  dateLine: string;
  shippingText: string;
  canBuy: boolean;
  disabledLabel: string;
  soldOut: boolean;
  signedIn: boolean;
  makeToOrder?: { makerName: string; leadDays: number; href: string } | null;
}) {
  const m = product.maker;
  const instalment = Math.ceil(product.priceCents / SITE.payments.afterpayInstalments);
  return (
    <div className="pb-[96px]" data-testid="phone-product">
      <PhoneGallery
        images={product.images}
        title={product.title}
        productId={product.id}
        saved={saved}
        slug={product.slug}
      />
      <div className="px-4">
        <div className="flex items-center gap-3 py-4">
          <Link
            href={`/makers/${m.slug}`}
            className="flex min-w-0 flex-1 items-center gap-3"
            data-testid="maker-row"
          >
            <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-circle bg-stone">
              {m.avatarUrl && (
                <Image src={m.avatarUrl} alt="" fill sizes="40px" className="object-cover" />
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[14px]">{m.displayName}</span>
              <span className="block truncate text-[12px] text-muted">
                {m.reviewCount > 0 ? `★ ${m.rating.toFixed(1)} · ` : ''}
                {m.location ?? m.city}
              </span>
            </span>
          </Link>
          <FollowButton
            makerId={m.id}
            following={following}
            makerName={m.displayName}
            look="rail"
          />
        </div>
        <h1 className="text-[34px] leading-[0.98]">{product.title}</h1>
        <p className="mt-3 text-[18px]">{formatPrice(product.priceCents)}</p>
        <p className="mt-0.5 text-[12px] text-muted">
          or {SITE.payments.afterpayInstalments} payments of {formatPrice(instalment)} with Afterpay
        </p>
        <p className="mt-2 text-[13px]" data-testid="availability-phone">
          <span className="block">{typeLine}</span>
          <span className="block text-muted">{dateLine}</span>
        </p>
        <div className="mt-4">
          <PhoneBuy
            productId={product.id}
            productType={product.productType}
            priceCents={product.priceCents}
            variants={product.variants.filter((v) => v.isActive)}
            colours={product.colours}
            savedFit={savedFit}
            canBuy={canBuy}
            disabledLabel={disabledLabel}
            askHref={
              signedIn
                ? `/products/${product.slug}/ask`
                : `/login?next=/products/${product.slug}/ask`
            }
            soldOut={soldOut}
            signedIn={signedIn}
            makeToOrder={
              makeToOrder ? { ...makeToOrder, price: formatPrice(product.priceCents) } : null
            }
          />
        </div>

        {story && (
          <a
            href="#story"
            className="mt-4 flex items-center gap-3 rounded-app bg-stone px-4 py-3"
            data-testid="story-link-phone"
          >
            <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-circle bg-surface">
              {story.writer.avatarUrl && (
                <Image
                  src={story.writer.avatarUrl}
                  alt=""
                  fill
                  sizes="40px"
                  className="object-cover"
                />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] uppercase tracking-label text-muted-2">
                Story of the garment
              </span>
              {story.story.quote && (
                <span className="block truncate font-display text-[17px] leading-tight">
                  “{story.story.quote}”
                </span>
              )}
              {story.story.hoursToMake != null && (
                <span className="block text-[12px] text-muted">
                  {story.story.hoursToMake} hours of making
                </span>
              )}
            </span>
            <ChevronIcon width={16} height={16} />
          </a>
        )}

        <div className="mt-5">
          <Row title="Description" open>
            <p className="whitespace-pre-line text-ink">{product.description}</p>
          </Row>
          <Row title="Fabric & care" testId="row-fabric">
            <dl className="grid grid-cols-[90px_1fr] gap-y-1.5">
              <dt className="text-muted-2">Fabric</dt>
              <dd className="text-ink">{product.fabricComposition}</dd>
              <dt className="text-muted-2">Care</dt>
              <dd className="text-ink">{product.careInstructions}</dd>
              <dt className="text-muted-2">Made in</dt>
              <dd className="text-ink">
                {m.city}, {product.countryOfMaking}
              </dd>
            </dl>
          </Row>
          <Row title="Delivery" testId="row-delivery">
            <p>{shippingText}</p>
          </Row>
          <Row
            title="Returns"
            testId="row-returns"
            id="returns-phone"
            open={product.productType === 'made_to_order'}
          >
            <ReturnsPolicy productType={product.productType} link testId="returns-row-phone" />
          </Row>
          <div className="border-t border-line" />
        </div>
      </div>

      {story && (
        <section id="story" className="mt-8 bg-stone px-4 py-6" aria-label="Story of the garment">
          <p className="text-[11px] uppercase tracking-label text-muted-2">
            The story of this piece
          </p>
          <p className="mt-2 font-display text-[24px] leading-tight">“{story.story.quote}”</p>
          {story.story.inspiration && (
            <p className="mt-3 text-[14px] text-muted">{story.story.inspiration}</p>
          )}
          {story.story.details.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5" role="list">
              {story.story.details.map((d) => (
                <li
                  key={d}
                  className="rounded-pill border border-line-strong px-2.5 py-1 text-[12px]"
                >
                  {d}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-[12px] text-muted-2">
            {story.writer.name}, {story.writer.shop}
            {story.story.hoursToMake ? ` · ${story.story.hoursToMake} hours to make` : ''}
          </p>
        </section>
      )}

      {more.length > 0 && (
        <section className="mt-8" aria-labelledby="more-from">
          <h2 id="more-from" className="px-4 font-display text-[24px]">
            More from {m.displayName}
          </h2>
          <ul className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-4" role="list">
            {more.slice(0, 8).map((p) => (
              <li key={p.id} className="w-[150px] shrink-0">
                <Link href={`/products/${p.slug}`} className="block" aria-label={p.title}>
                  <span className="relative block aspect-4/5 overflow-hidden rounded-app bg-stone">
                    {p.imageUrl && (
                      <Image
                        src={p.imageUrl}
                        alt=""
                        fill
                        sizes="150px"
                        className="object-cover object-top"
                      />
                    )}
                  </span>
                  <span className="mt-1.5 block text-[13px] font-medium">
                    {formatPrice(p.priceCents)}
                  </span>
                  <span className="block truncate text-[12px] text-muted">
                    {TYPE[p.productType]} · {p.title}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <span className="sr-only">{savedIds.size} liked</span>
        </section>
      )}
    </div>
  );
}
