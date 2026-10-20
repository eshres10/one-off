import Link from 'next/link';
import { RETURNS } from '@/lib/content/returns';
import { getReturnPolicy } from '@/lib/returns/policy';
import { formatPrice } from '@/lib/domain/money';
import type { PieceInfo, ThreadDetail } from '@/lib/services/messaging';
import { buttonClass } from '@/components/ui/Button';
import { CheckIcon, StarIcon } from '@/components/ui/icons';
import { Img as Image } from '@/components/ui/Img';
import { AddToBagButton } from './AddToBagButton';

export const TYPE_LABEL: Record<string, string> = {
  ready_to_ship: 'Ready to ship',
  made_to_order: 'Made to order',
  one_of_one: 'One of one',
};

export function pieceTiming(p: PieceInfo) {
  if (p.productType === 'made_to_order')
    return `Made to order · ${p.leadTimeDays ?? 14} days to make`;
  if (p.totalStock <= 0) return 'Sold out';
  return `Ships in ${p.dispatchDays} business ${p.dispatchDays === 1 ? 'day' : 'days'}`;
}

/** The size to add from a conversation: the one asked about, else the only one available. */
export function pickVariant(p: PieceInfo, askedAbout: string | null | undefined) {
  const buyable = p.variants.filter((v) => v.stock > 0 || p.productType === 'made_to_order');
  if (askedAbout && buyable.some((v) => v.id === askedAbout)) return askedAbout;
  return buyable.length === 1 ? buyable[0]!.id : null;
}

export function shippingFor(p: PieceInfo) {
  return p.freeShippingOverCents && p.priceCents >= p.freeShippingOverCents ? 0 : p.shippingCents;
}

function MakerCard({ t }: { t: ThreadDetail }) {
  return (
    <section className="shrink-0 border border-line bg-surface p-4" aria-label="Maker">
      <div className="flex items-center gap-3">
        <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-circle bg-stone-light">
          {t.makerAvatar && (
            <Image src={t.makerAvatar} alt="" fill sizes="48px" className="object-cover" />
          )}
        </span>
        <div className="min-w-0">
          <Link
            href={`/makers/${t.makerSlug}`}
            className="font-display text-[22px] leading-tight hover:underline"
          >
            {t.makerName}
          </Link>
          <p className="flex items-center gap-1 text-[12px] text-muted">
            <StarIcon width={12} height={12} filled /> {t.makerRating.toFixed(1)} · {t.makerSold}{' '}
            sold
          </p>
        </div>
      </div>
      <dl className="mt-3 space-y-1 text-[12px] text-muted">
        {t.makerSuburb && (
          <div>
            <dt className="sr-only">Studio</dt>
            <dd>{t.makerSuburb}</dd>
          </div>
        )}
        <div>
          <dt className="sr-only">Replies</dt>
          <dd>Usually replies within {t.makerResponseHours} hours</dd>
        </div>
        <div className="flex items-center gap-1.5 text-ink">
          <CheckIcon width={13} height={13} />
          <dd>Verified maker</dd>
        </div>
      </dl>
    </section>
  );
}

/** Right column of the buyer's conversation: who you're talking to and what about. */
export function BuyerPanel({
  thread,
  piece,
  checkoutOn,
}: {
  thread: ThreadDetail;
  piece: PieceInfo | null;
  checkoutOn: boolean;
}) {
  const shipping = piece ? shippingFor(piece) : 0;
  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <MakerCard t={thread} />
      {thread.context.customRequestNumber && (
        <section className="shrink-0 border border-ink bg-surface p-4" aria-label="Custom request">
          <p className="text-[11px] uppercase tracking-label">
            Custom request {thread.context.customRequestNumber}
          </p>
          <p className="mt-2 text-[13px] text-muted">
            Their quote, and Accept, are on your request page.
          </p>
          <Link
            href={`/account/requests/${thread.context.customRequestNumber}`}
            className={buttonClass('secondary', 'md', 'mt-3 w-full')}
            data-testid="panel-request-link"
          >
            View request
          </Link>
        </section>
      )}
      {piece && (
        <section className="shrink-0 border border-line bg-surface p-4" aria-label="The piece">
          <p className="text-[11px] uppercase tracking-label text-muted-2">The piece</p>
          <div className="mt-3 flex gap-3">
            <span className="relative h-[90px] w-[72px] shrink-0 overflow-hidden bg-stone-light">
              {piece.imageUrl && (
                <Image
                  src={piece.imageUrl}
                  alt=""
                  fill
                  sizes="72px"
                  className="object-cover object-top"
                />
              )}
            </span>
            <div className="min-w-0 text-[13px]">
              <p className="font-normal">{piece.title}</p>
              {thread.context.variantLabel && (
                <p className="text-muted">{thread.context.variantLabel}</p>
              )}
              <span className="mt-1.5 inline-block border border-ink px-1.5 py-[2px] text-[10px] uppercase tracking-[0.12em]">
                {TYPE_LABEL[piece.productType]}
              </span>
              <p className="mt-1.5 text-[12px] text-muted">{pieceTiming(piece)}</p>
            </div>
          </div>
          <dl className="mt-4 space-y-1.5 border-t border-line pt-3 text-[13px]">
            <div className="flex justify-between">
              <dt className="text-muted">Piece</dt>
              <dd>{formatPrice(piece.priceCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">
                Shipping{thread.makerSuburb ? ` from ${thread.makerSuburb}` : ''}
              </dt>
              <dd>{shipping ? formatPrice(shipping) : 'Free'}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-1.5">
              <dt>Total (incl. GST)</dt>
              <dd>{formatPrice(piece.priceCents + shipping)}</dd>
            </div>
          </dl>
          <div className="mt-4 space-y-2">
            {thread.kind === 'enquiry' && (
              <AddToBagButton
                productId={piece.id}
                productSlug={piece.slug}
                variantId={pickVariant(piece, thread.context.variantId)}
                disabledLabel={
                  !checkoutOn || piece.previewOnly
                    ? 'Opens at launch'
                    : piece.totalStock <= 0 && piece.productType !== 'made_to_order'
                      ? 'Sold out'
                      : null
                }
                className="w-full"
              />
            )}
            <Link
              href={`/products/${piece.slug}`}
              className={buttonClass('secondary', 'md', 'w-full')}
            >
              View piece
            </Link>
          </div>
          {thread.kind === 'enquiry' && (
            <p className="mt-3 text-center">
              <Link
                href={`/have-it-made?source_listing_id=${piece.id}`}
                className="text-[13px] underline underline-offset-[5px]"
              >
                Want it different? Request a custom version
              </Link>
            </p>
          )}
        </section>
      )}
      <p className="shrink-0 px-1 text-[12px] text-muted">
        {piece ? getReturnPolicy(piece.productType).summary : RETURNS.short}
      </p>
    </div>
  );
}
