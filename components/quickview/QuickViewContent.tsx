import Link from 'next/link';
import { estimateDelivery } from '@/lib/domain/leadTime';
import { formatPrice } from '@/lib/domain/money';
import { PREVIEW_ONLY_LABEL } from '@/lib/domain/preview';
import type { ProductDetail } from '@/lib/queries/catalog';
import { shopBuyable } from '@/lib/domain/shop';
import type { QaEntry } from '@/lib/queries/questions';
import { FollowButton } from '@/components/maker/FollowButton';
import { AskQuestionForm, Questions } from '@/components/product/Questions';
import { Img as Image } from '@/components/ui/Img';
import { ReturnsPolicy } from '@/components/ui/ReturnsPolicy';
import { DwellTracker } from './DwellTracker';
import { QuickBuy } from './QuickBuy';
import { QuickGallery } from './QuickGallery';
import { MoreMenu } from './MoreMenu';

const day = (d: Date) =>
  d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
const dayMonth = (d: Date) =>
  d.toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

/** "Made in 14 days · Delivery Wed 4 – Fri 6 Nov" or "Dispatches within 2 days · 2 left". */
export function timingLine(p: ProductDetail): string {
  const est = estimateDelivery({
    productType: p.productType,
    leadTimeDays: p.leadTimeDays,
    dispatchDays: p.maker.dispatchDays,
  });
  const sameMonth = est.deliveryFrom.getUTCMonth() === est.deliveryTo.getUTCMonth();
  const delivery = `Delivery ${sameMonth ? day(est.deliveryFrom) : dayMonth(est.deliveryFrom)} – ${dayMonth(est.deliveryTo)}`;
  if (p.productType === 'made_to_order') return `Made in ${p.leadTimeDays} days · ${delivery}`;
  const stock = p.variants.reduce((s, v) => s + Math.max(0, v.stockQuantity), 0);
  if (stock === 0) return 'Sold out · Follow the maker to hear about restocks';
  const days = p.maker.dispatchDays;
  return `Dispatches within ${days} ${days === 1 ? 'day' : 'days'} · ${
    p.productType === 'one_of_one' ? 'One of one' : `${stock} left`
  }`;
}

export function QuickViewContent({
  product: p,
  saved,
  saveCount,
  following,
  qa,
  signedIn,
  isMaker,
  checkoutOn,
  previewOnly,
  nextSlot = null,
}: {
  product: ProductDetail;
  saved: boolean;
  saveCount: number;
  following: boolean;
  qa: QaEntry[];
  signedIn: boolean;
  isMaker: boolean;
  checkoutOn: boolean;
  previewOnly: boolean;
  /** Made-to-order piece at capacity: when the next making slot opens. */
  nextSlot?: string | null;
}) {
  const m = p.maker;
  const suburb = (m.location ?? m.city ?? '').split(',')[0]?.trim();
  const full = `/products/${p.slug}`;
  const sale = shopBuyable(m);
  return (
    <div className="flex h-full">
      {signedIn && <DwellTracker productId={p.id} />}
      <div className="h-full w-[55%] shrink-0">
        <QuickGallery images={p.images} title={p.title} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div data-qv-scroll className="min-h-0 flex-1 overflow-y-auto px-7 pb-6 pt-5">
          <div className="flex items-center gap-3">
            <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-circle bg-stone-light">
              {m.avatarUrl && (
                <Image src={m.avatarUrl} alt="" fill sizes="40px" className="object-cover" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <Link
                href={`/makers/${m.slug}`}
                className="block truncate text-[14px] hover:underline"
              >
                {m.displayName}
              </Link>
              <p className="truncate text-[11px] text-muted-2">
                {[suburb, m.reviewCount > 0 ? `★ ${m.rating.toFixed(1)}` : null, 'Verified maker']
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            {!isMaker && (
              <FollowButton
                makerId={m.id}
                following={following}
                makerName={m.displayName}
                look="rail"
              />
            )}
            <MoreMenu title={p.title} slug={p.slug} />
          </div>

          {previewOnly && (
            <p className="mt-5 inline-block bg-ink px-2 py-[3px] text-[10px] uppercase leading-4 tracking-[0.14em] text-ground">
              {PREVIEW_ONLY_LABEL}
            </p>
          )}
          <h2 id="qv-title" className="mt-5 text-[36px] leading-[1]">
            {p.title}
          </h2>
          <p className="mt-2 text-[15px]">{formatPrice(p.priceCents)}</p>
          <p className="mt-1 text-[13px] text-muted" data-testid="qv-timing">
            {timingLine(p)}
            {nextSlot ? ` · Next slot: ${nextSlot}` : ''}
          </p>

          <QuickBuy
            productId={p.id}
            slug={p.slug}
            title={p.title}
            colours={p.colours}
            variants={p.variants}
            saved={saved}
            saveCount={saveCount}
            checkoutEnabled={checkoutOn && !previewOnly && sale.ok}
            disabledLabel={previewOnly ? 'Preview only' : sale.ok ? 'Launching soon' : sale.label}
          />

          {!sale.ok && !previewOnly && (
            <p
              className="mt-3 bg-stone-light px-3 py-2.5 text-[13px]"
              data-testid="shop-unavailable"
            >
              {sale.message}
              {sale.kind === 'away' && m.holidayNote ? ` ${m.holidayNote}` : ''}
            </p>
          )}

          <dl className="mt-7 space-y-3 border-t border-line pt-5 text-[13px]">
            <div>
              <dt className="sr-only">Description</dt>
              <dd className="whitespace-pre-line leading-relaxed text-text2">{p.description}</dd>
            </div>
            {p.fabricComposition && (
              <div className="grid grid-cols-[84px_1fr]">
                <dt className="text-muted-2">Fabric</dt>
                <dd>{p.fabricComposition}</dd>
              </div>
            )}
            <div className="grid grid-cols-[84px_1fr]">
              <dt className="text-muted-2">Made in</dt>
              <dd>{[m.city, p.countryOfMaking].filter(Boolean).join(', ')}</dd>
            </div>
            <div className="grid grid-cols-[84px_1fr]">
              <dt className="text-muted-2">Returns</dt>
              <dd>
                <ReturnsPolicy productType={p.productType} testId="qv-returns" />
              </dd>
            </div>
          </dl>

          <section aria-labelledby="qv-qa" className="mt-7 border-t border-line pt-5">
            <h3 id="qv-qa" className="mb-4 text-[11px] uppercase tracking-label">
              Questions &amp; reviews ({qa.length})
            </h3>
            <Questions entries={qa} slug={p.slug} canReply={isMaker} />
          </section>

          <a
            href={full}
            className="mt-7 inline-flex min-h-[44px] items-center text-[11px] uppercase tracking-label underline underline-offset-[5px]"
            data-testid="qv-full-details"
          >
            View full details →
          </a>
        </div>
        <div className="border-t border-line bg-ground px-7 py-3">
          <AskQuestionForm
            productId={p.id}
            slug={p.slug}
            makerName={m.displayName}
            signedIn={signedIn}
            isMaker={isMaker}
          />
        </div>
      </div>
    </div>
  );
}
