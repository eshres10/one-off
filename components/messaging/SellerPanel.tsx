import Link from 'next/link';
import { formatPrice } from '@/lib/domain/money';
import type { BuyerInfo, PieceInfo, QuoteView, ThreadDetail } from '@/lib/services/messaging';
import { buttonClass } from '@/components/ui/Button';
import { Img as Image } from '@/components/ui/Img';
import { TYPE_LABEL } from './BuyerPanel';

function stockLine(p: PieceInfo) {
  if (p.productType === 'made_to_order')
    return `Next production slot: ${p.leadTimeDays ?? 14} days`;
  if (p.totalStock <= 0) return 'Sold out';
  return `${p.totalStock} in stock`;
}

function tip(thread: ThreadDetail, piece: PieceInfo | null, quote: QuoteView | null) {
  if (thread.kind === 'custom_request' && !quote)
    return 'Send a quote from the composer. Buyers can accept it and pay the deposit in one step.';
  if (thread.kind === 'custom_request' && quote?.depositPaidAt)
    return 'The deposit is paid. Share progress photos here so the buyer knows how it’s going.';
  if (piece && piece.productType === 'made_to_order')
    return 'Shoppers asking about fit buy more often when you confirm their size from their measurements.';
  if (piece && piece.totalStock > 0 && piece.totalStock <= 2)
    return `Only ${piece.totalStock} left — let them know before it sells out.`;
  return `Replying within 6 hours keeps your “Replies within 6 hrs” badge.`;
}

/** Right column of the studio conversation: the buyer, your listing and how it's doing. */
export function SellerPanel({
  thread,
  buyer,
  piece,
  quote,
}: {
  thread: ThreadDetail;
  buyer: BuyerInfo | null;
  piece: PieceInfo | null;
  quote: QuoteView | null;
}) {
  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      {buyer && (
        <section className="shrink-0 border border-line bg-surface p-4" aria-label="Buyer">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-circle bg-stone-light text-[13px]">
              {buyer.initials}
            </span>
            <div>
              <p className="font-display text-[22px] leading-tight">{buyer.name}</p>
              <p className="text-[12px] text-muted">{buyer.location ?? 'Australia'}</p>
            </div>
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 text-[12px]">
            <div>
              <dt className="text-muted-2">Member since</dt>
              <dd>
                {new Date(buyer.memberSince).toLocaleDateString('en-AU', {
                  month: 'short',
                  year: 'numeric',
                })}
              </dd>
            </div>
            <div>
              <dt className="text-muted-2">Orders</dt>
              <dd>{buyer.orders}</dd>
            </div>
            <div>
              <dt className="text-muted-2">As a buyer</dt>
              <dd>{buyer.orders > 0 ? 'Good standing' : 'New'}</dd>
            </div>
          </dl>
        </section>
      )}
      {quote && (
        <section className="shrink-0 border border-ink bg-surface p-4" aria-label="Quote">
          <p className="text-[11px] uppercase tracking-label">
            {quote.depositPaidAt
              ? 'Deposit paid'
              : quote.quoteStatus === 'accepted'
                ? 'Quote accepted'
                : quote.quoteStatus === 'pending'
                  ? 'Quote sent · Awaiting buyer'
                  : 'Quote declined'}
          </p>
          <p className="mt-2 text-[13px]">
            {formatPrice(quote.totalPriceCents)} · deposit {formatPrice(quote.depositCents)} · made
            in {Math.round(quote.productionDays / 7)} weeks
          </p>
        </section>
      )}
      {piece && (
        <section className="shrink-0 border border-line bg-surface p-4" aria-label="Your listing">
          <p className="text-[11px] uppercase tracking-label text-muted-2">Your listing</p>
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
              <p>{piece.title}</p>
              <p className="text-muted">
                {formatPrice(piece.priceCents)} · {TYPE_LABEL[piece.productType]}
              </p>
              <p className="mt-1 text-[12px] text-muted">{stockLine(piece)}</p>
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
            <div>
              <dd className="font-display text-[24px] leading-none">{piece.views7d}</dd>
              <dt className="mt-1 text-[10px] uppercase tracking-label text-muted-2">Views (7d)</dt>
            </div>
            <div>
              <dd className="font-display text-[24px] leading-none">{piece.saves}</dd>
              <dt className="mt-1 text-[10px] uppercase tracking-label text-muted-2">Saves</dt>
            </div>
            <div>
              <dd className="font-display text-[24px] leading-none">{piece.openEnquiries}</dd>
              <dt className="mt-1 text-[10px] uppercase tracking-label text-muted-2">Enquiries</dt>
            </div>
          </dl>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link href={`/seller/listings/${piece.id}`} className={buttonClass('secondary', 'sm')}>
              Edit listing
            </Link>
            <Link href={`/products/${piece.slug}`} className={buttonClass('secondary', 'sm')}>
              View as buyer
            </Link>
          </div>
        </section>
      )}
      <section className="shrink-0 bg-stone-light p-4 text-[12px] text-text2" aria-label="Tip">
        <p className="text-[10px] uppercase tracking-label text-muted-2">Tip</p>
        <p className="mt-1">{tip(thread, piece, quote)}</p>
      </section>
    </div>
  );
}
