import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { getBuyerOrders } from '@/lib/queries/account';
import { Parcel } from '@/components/account/Parcel';
import { AgreedSpec } from '@/components/commissions/AgreedSpec';
import { formatPrice } from '@/lib/domain/money';
import { gstIncluded } from '@/lib/services/checkout';
import { SITE } from '@/lib/site/config';
import { AutoRefresh } from '@/components/ui/AutoRefresh';

export const metadata = { title: 'Order' };

const placed = (d: Date) =>
  new Date(d).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: SITE.adminTimeZone,
  });

/** Where it's going, short: "12 Smith St, Fitzroy". */
function deliveringTo(a: Record<string, string> | null): string | null {
  if (!a) return null;
  return [a.line1, a.city ?? a.suburb].filter(Boolean).join(', ') || null;
}

export default async function OrderPage({ params }: { params: { id: string } }) {
  const ref = decodeURIComponent(params.id);
  const user = await requireUser(`/account/orders/${ref}`);
  if (!/^(OO-[A-Z0-9-]{1,20}|[0-9a-f-]{36})$/i.test(ref)) notFound();
  const [order] = await getBuyerOrders(
    user,
    ref.toUpperCase().startsWith('OO-') ? ref.toUpperCase() : ref,
  );
  if (!order) notFound();
  const to = deliveringTo(order.shippingAddress);
  return (
    <div className="max-w-3xl">
      <AutoRefresh />
      <Link
        href="/account/orders"
        className="hidden text-[12px] uppercase tracking-label text-muted hover:text-ink md:inline"
      >
        ‹ All orders
      </Link>
      <header className="mt-2 md:mt-4">
        <h1 className="font-display text-[44px] leading-none" data-testid="order-number">
          {order.orderNumber}
        </h1>
        <p className="mt-3 text-[14px] text-muted" data-testid="order-meta">
          Placed {placed(order.paidAt ?? order.createdAt)} · {formatPrice(order.totalCents)}
          {to ? ` · Delivering to ${to}` : ''}
        </p>
        <a
          href={`/account/orders/${order.orderNumber}/receipt`}
          className="mt-3 inline-flex min-h-[44px] items-center text-[13px] underline underline-offset-[3px]"
          data-testid="download-receipt"
        >
          Download receipt
        </a>
      </header>

      <div className="mt-6">
        {order.fulfilments.map((f) => (
          <Parcel
            key={f.id}
            f={f}
            orderNumber={order.orderNumber}
            orderedAt={order.paidAt ?? order.createdAt}
          />
        ))}
      </div>

      {order.agreedSpec && (
        <div className="border-t border-line py-8">
          <AgreedSpec spec={order.agreedSpec} />
        </div>
      )}

      <footer className="border-t border-line pt-6" data-testid="order-footer">
        <dl className="max-w-sm space-y-1.5 text-[14px]">
          <div className="flex justify-between">
            <dt className="text-muted">Subtotal</dt>
            <dd>{formatPrice(order.subtotalCents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Delivery</dt>
            <dd>{order.shippingTotalCents ? formatPrice(order.shippingTotalCents) : 'Free'}</dd>
          </div>
          {order.shippingSavingCents > 0 && (
            <div className="flex justify-between" data-testid="order-shipping-saving">
              <dt className="text-muted">You saved on shipping</dt>
              <dd>{formatPrice(order.shippingSavingCents)}</dd>
            </div>
          )}
          {order.refundedCents > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted">Refunded</dt>
              <dd>−{formatPrice(order.refundedCents)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-line pt-2 text-[16px]">
            <dt>Total</dt>
            <dd>{formatPrice(order.totalCents)}</dd>
          </div>
          {SITE.tax.showGstIncludedLine && (
            <p className="text-right text-[12px] text-muted">
              Includes {formatPrice(gstIncluded(order.totalCents))} GST
            </p>
          )}
        </dl>
        <p className="mt-6 max-w-xl text-[13px] leading-relaxed text-muted">
          Your payment is held until each piece arrives. Something not right with a delivered piece?
          Use ‘Report a problem’ on that piece and we’ll sort it out with the maker.
        </p>
      </footer>
    </div>
  );
}
