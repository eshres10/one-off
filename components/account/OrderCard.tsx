import Link from 'next/link';
import { Img as Image } from '@/components/ui/Img';
import type { BuyerOrder } from '@/lib/queries/account';
import { formatPrice } from '@/lib/domain/money';
import { formatDateRange } from '@/lib/domain/leadTime';
import { StatusPill } from '@/components/ui/Badge';
import { ReviewForm } from './ReviewForm';
import { CLAIM_STATUS_LABEL, canReportProblem } from '@/lib/domain/claims';
import type { BuyerFulfilment, BuyerOrderItem } from '@/lib/queries/account';
import { confirmReceivedAction } from '@/lib/actions/studio-orders';
import { isDelivered } from '@/lib/domain/types';
import { carrierLabel, trackingUrl } from '@/lib/studio/carriers';

const MAKING = ['Ordered', 'Fabric bought', 'Cutting', 'Sewing', 'Finishing'];

/** What the buyer sees of a made-to-order piece's progress, and the shipping line. */
function Progress({ f }: { f: BuyerFulfilment }) {
  const making = f.isMto && ['paid', 'making', 'ready', 'preparing'].includes(f.status);
  const link = trackingUrl(f.carrier, f.trackingNumber);
  return (
    <>
      {making && (
        <ol
          className="mt-3 grid grid-cols-4 gap-1"
          aria-label="Making progress"
          data-testid="buyer-making"
        >
          {MAKING.map((step, i) => (
            <li
              key={step}
              aria-current={i === f.mtoStep ? 'step' : undefined}
              className={`border-t-2 pt-1.5 text-[10px] uppercase tracking-[0.12em] ${i <= f.mtoStep ? 'border-ink text-ink' : 'border-line text-muted-2'}`}
            >
              {step}
            </li>
          ))}
        </ol>
      )}
      <p className="mt-1 text-xs text-ink-muted">
        {f.trackingNumber ? (
          <>
            {carrierLabel(f.carrier)}:{' '}
            {link ? (
              <a href={link} className="link" target="_blank" rel="noreferrer">
                {f.trackingNumber}
              </a>
            ) : (
              f.trackingNumber
            )}
          </>
        ) : f.status === 'shipped' && f.carrier === 'hand' ? (
          'Being hand delivered by the maker'
        ) : f.estimatedDeliveryFrom && f.estimatedDeliveryTo ? (
          `Estimated delivery ${formatDateRange(new Date(f.estimatedDeliveryFrom), new Date(f.estimatedDeliveryTo))}`
        ) : null}
      </p>
      {f.status === 'shipped' && (
        <form action={confirmReceivedAction} className="mt-2">
          <input type="hidden" name="fulfilmentId" value={f.id} />
          <button
            type="submit"
            className="min-h-[44px] border border-ink px-4 text-[11px] uppercase tracking-label hover:bg-ink hover:text-ground"
            data-testid="received-it"
          >
            I’ve received it
          </button>
        </form>
      )}
    </>
  );
}

/**
 * "Report a problem" within the report window after delivery; otherwise a contact link, since
 * the buyer's consumer-law rights continue after the window closes.
 */
function ItemHelp({ item, orderId }: { item: BuyerOrderItem; orderId: string }) {
  if (item.claimId && item.claimStatus) {
    return (
      <Link
        href={`/account/claims/${item.claimId}`}
        className="mt-1 inline-block text-[12px] underline underline-offset-[3px]"
        data-testid="item-claim-link"
      >
        Problem reported · {CLAIM_STATUS_LABEL[item.claimStatus]}
      </Link>
    );
  }
  if (canReportProblem(item.deliveredAt ? new Date(item.deliveredAt) : null)) {
    return (
      <Link
        href={`/account/orders/${orderId}/report/${item.id}`}
        className="mt-1 inline-block text-[12px] underline underline-offset-[3px]"
        data-testid="report-problem"
      >
        Report a problem
      </Link>
    );
  }
  return (
    <Link
      href="/help#contact"
      className="mt-1 inline-block text-[12px] text-muted underline underline-offset-[3px]"
      data-testid="contact-us"
    >
      Need help? Contact us
    </Link>
  );
}

export function OrderCard({ order, detailed = false }: { order: BuyerOrder; detailed?: boolean }) {
  return (
    <article className="card overflow-hidden" data-testid="buyer-order">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-stone/70 bg-stone-light/40 px-4 py-3 text-sm">
        <div>
          <Link href={`/account/orders/${order.id}`} className="font-medium hover:underline">
            Order {order.orderNumber}
          </Link>
          <span className="text-ink-muted">
            {' '}
            · {new Date(order.createdAt).toLocaleDateString('en-AU', { dateStyle: 'medium' })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {order.refundedCents > 0 && <StatusPill status={order.status} />}
          <span className="font-medium">{formatPrice(order.totalCents)}</span>
        </div>
      </header>
      {order.fulfilments.map((f) => (
        <section
          key={f.id}
          className="border-b border-stone/60 px-4 py-4 last:border-0"
          aria-label={`From ${f.makerName}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p>
              From{' '}
              <Link href={`/makers/${f.makerSlug}`} className="font-medium hover:underline">
                {f.makerName}
              </Link>
            </p>
            <StatusPill status={f.status === 'completed' ? 'delivered' : f.status} />
          </div>
          <Progress f={f} />
          <ul className="mt-3 space-y-3" role="list">
            {f.items.map((i) => (
              <li key={i.id} className="flex gap-3">
                <span className="relative aspect-4/5 w-14 shrink-0 overflow-hidden rounded-md bg-stone-light">
                  {i.imageUrl && (
                    <Image
                      src={i.imageUrl}
                      alt={i.productTitle}
                      fill
                      sizes="56px"
                      className="object-cover"
                    />
                  )}
                </span>
                <div className="min-w-0 flex-1 text-sm">
                  {i.productSlug ? (
                    <Link
                      href={`/products/${i.productSlug}`}
                      className="font-medium hover:underline"
                    >
                      {i.productTitle}
                    </Link>
                  ) : (
                    <p className="font-medium">{i.productTitle}</p>
                  )}
                  <p className="text-ink-muted">
                    {i.variantLabel} × {i.quantity} · {formatPrice(i.lineTotalCents)}
                  </p>
                  {i.fulfilmentStatus === 'refunded' && (
                    <p className="text-xs text-alert">Refunded</p>
                  )}
                  <ItemHelp item={i} orderId={order.id} />
                  {isDelivered(i.fulfilmentStatus) &&
                    (i.reviewed ? (
                      <p className="text-xs text-moss">Reviewed — thank you</p>
                    ) : (
                      <ReviewForm orderItemId={i.id} productTitle={i.productTitle} />
                    ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {detailed && (
        <footer className="grid gap-4 bg-stone-light/30 px-4 py-4 text-sm sm:grid-cols-2">
          <dl className="space-y-1">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd>{formatPrice(order.subtotalCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Shipping</dt>
              <dd>{formatPrice(order.shippingTotalCents)}</dd>
            </div>
            {order.shippingSavingCents > 0 && (
              <div className="flex justify-between">
                <dt>You saved on shipping</dt>
                <dd>{formatPrice(order.shippingSavingCents)}</dd>
              </div>
            )}
            {order.refundedCents > 0 && (
              <div className="flex justify-between text-alert">
                <dt>Refunded</dt>
                <dd>−{formatPrice(order.refundedCents)}</dd>
              </div>
            )}
            <div className="flex justify-between font-semibold">
              <dt>Total</dt>
              <dd>{formatPrice(order.totalCents)}</dd>
            </div>
          </dl>
          {order.shippingAddress && (
            <address className="not-italic text-ink-soft">
              {[
                order.shippingAddress.name,
                order.shippingAddress.line1,
                order.shippingAddress.line2,
                `${order.shippingAddress.city ?? ''} ${order.shippingAddress.state ?? ''} ${order.shippingAddress.postal_code ?? ''}`,
              ]
                .filter(Boolean)
                .map((l) => (
                  <span key={l} className="block">
                    {l}
                  </span>
                ))}
            </address>
          )}
        </footer>
      )}
    </article>
  );
}
