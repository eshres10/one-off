import Link from 'next/link';
import { acceptQuoteAction } from '@/lib/actions/messages';
import { formatPrice } from '@/lib/domain/money';
import type { PieceInfo, QuoteView, ThreadDetail } from '@/lib/services/messaging';
import { ChevronIcon, StarIcon } from '@/components/ui/icons';
import { Img as Image } from '@/components/ui/Img';
import { AddToBagButton } from './AddToBagButton';
import { pickVariant, TYPE_LABEL } from './BuyerPanel';

/**
 * Top of a conversation. Desktop: serif name and "About: piece · variant". Phone: a glass header
 * (back, name, rating and reply time) over a glass strip for the piece with its buy action.
 */
export function ThreadTop({
  thread,
  viewer,
  backHref,
  title,
  subtitle,
  piece,
  quote,
  checkoutOn,
  actions,
}: {
  thread: ThreadDetail;
  viewer: 'buyer' | 'maker';
  backHref: string;
  title: string;
  subtitle: string;
  piece: PieceInfo | null;
  quote: QuoteView | null;
  checkoutOn: boolean;
  actions?: React.ReactNode;
}) {
  const about = [
    thread.context.productTitle ?? thread.context.commissionGarment,
    thread.context.variantLabel,
  ]
    .filter(Boolean)
    .join(' · ');
  const canAccept =
    viewer === 'buyer' &&
    quote &&
    !quote.depositPaidAt &&
    ['pending', 'accepted'].includes(quote.quoteStatus);
  return (
    <>
      <div className="hidden items-start justify-between gap-4 border-b border-line px-6 py-4 md:flex">
        <div className="min-w-0">
          <h2 className="truncate text-[30px] leading-tight">{title}</h2>
          <p className="truncate text-[12px] text-muted">
            {about ? `About: ${about}` : 'General question'}
          </p>
        </div>
        {actions}
      </div>

      <div className="md:hidden">
        <div className="glass-nav relative z-10 flex h-[60px] items-center gap-2 px-2">
          <Link
            href={backHref}
            aria-label="Back to messages"
            className="flex h-11 w-11 shrink-0 items-center justify-center"
          >
            <ChevronIcon dir="left" width={18} height={18} />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[22px] leading-none">{title}</p>
            <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted">
              {viewer === 'buyer' && <StarIcon width={11} height={11} filled />}
              {subtitle}
            </p>
          </div>
          {actions}
        </div>
        {(piece || quote) && (
          <div
            className="glass-nav relative flex items-center gap-3 px-3 py-2.5"
            data-testid="piece-strip"
          >
            {piece?.imageUrl && (
              <span className="relative h-[55px] w-[44px] shrink-0 overflow-hidden bg-stone-light">
                <Image
                  src={piece.imageUrl}
                  alt=""
                  fill
                  sizes="44px"
                  className="object-cover object-top"
                />
              </span>
            )}
            <div className="min-w-0 flex-1 text-[12px]">
              <p className="truncate text-[13px]">
                {piece?.title ?? thread.context.commissionGarment ?? 'Custom piece'}
              </p>
              <p className="text-muted">
                {quote
                  ? `Quote ${formatPrice(quote.totalPriceCents)}`
                  : piece
                    ? `${formatPrice(piece.priceCents)} · ${TYPE_LABEL[piece.productType]}`
                    : ''}
              </p>
            </div>
            {viewer === 'buyer' &&
              (thread.kind === 'custom_request' ? (
                canAccept ? (
                  <form action={acceptQuoteAction}>
                    <input type="hidden" name="requestId" value={quote!.requestId} />
                    <button
                      disabled={!checkoutOn}
                      className="glass-dark min-h-[44px] px-3 text-[10px] uppercase tracking-label disabled:opacity-50"
                      data-testid="accept-quote-mobile"
                    >
                      Accept quote
                    </button>
                  </form>
                ) : null
              ) : piece ? (
                <AddToBagButton
                  productId={piece.id}
                  productSlug={piece.slug}
                  variantId={pickVariant(piece, thread.context.variantId)}
                  disabledLabel={!checkoutOn || piece.previewOnly ? 'At launch' : null}
                  size="sm"
                  className="shrink-0 px-3 text-[10px]"
                />
              ) : null)}
          </div>
        )}
      </div>
    </>
  );
}
