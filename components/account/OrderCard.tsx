import Link from 'next/link';
import { Img as Image } from '@/components/ui/Img';
import type { BuyerOrder } from '@/lib/queries/account';
import { formatPrice } from '@/lib/domain/money';
import { formatDateRange } from '@/lib/domain/leadTime';
import { StatusPill } from '@/components/ui/Badge';
import { ReviewForm } from './ReviewForm';

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
            <StatusPill status={f.status} />
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            {f.trackingNumber
              ? `${f.carrier ?? 'Tracking'}: ${f.trackingNumber}`
              : f.estimatedDeliveryFrom && f.estimatedDeliveryTo
                ? `Estimated delivery ${formatDateRange(new Date(f.estimatedDeliveryFrom), new Date(f.estimatedDeliveryTo))}`
                : null}
          </p>
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
                  {i.fulfilmentStatus === 'delivered' &&
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
