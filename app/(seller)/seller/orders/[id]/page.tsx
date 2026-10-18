import Link from 'next/link';
import { AgreedSpec } from '@/components/commissions/AgreedSpec';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { Img as Image } from '@/components/ui/Img';
import { requireSeller } from '@/lib/auth/session';
import { getSellerOrders } from '@/lib/queries/seller';
import { formatPrice } from '@/lib/domain/money';
import { StatusPill, ProductBadgePill } from '@/components/ui/Badge';
import { FulfilmentActions } from '@/components/seller/FulfilmentActions';

export const metadata = { title: 'Order' };

export default async function SellerOrderPage({ params }: { params: { id: string } }) {
  const seller = await requireSeller();
  if (!z.string().uuid().safeParse(params.id).success) notFound();
  const [o] = await getSellerOrders(seller, params.id);
  if (!o) notFound();
  const a = o.shippingAddress;
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <Link href="/seller/orders" className="text-sm text-ink-muted hover:underline">
          ← All orders
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[40px] leading-none md:text-[48px]">Order {o.orderNumber}</h1>
          <StatusPill status={o.status} />
        </div>
        {o.agreedSpec && <AgreedSpec spec={o.agreedSpec} />}
        <ul
          className="divide-y divide-stone/70 rounded-2xl border border-stone/70 bg-white"
          role="list"
        >
          {o.items.map((i) => (
            <li key={i.id} className="flex gap-4 p-4">
              <span className="relative aspect-4/5 w-16 shrink-0 overflow-hidden rounded-lg bg-stone-light">
                {i.imageUrl && (
                  <Image
                    src={i.imageUrl}
                    alt={i.productTitle}
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                )}
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">{i.productTitle}</p>
                <p className="text-ink-muted">
                  {i.variantLabel} × {i.quantity}
                </p>
                <div className="mt-1">
                  <ProductBadgePill badge={i.productType} className="border border-stone/70" />
                </div>
                {i.fulfilmentStatus === 'refunded' && (
                  <p className="mt-1 text-xs text-alert">Refunded — do not ship</p>
                )}
              </div>
              <p className="text-sm">{formatPrice(i.lineTotalCents)}</p>
            </li>
          ))}
        </ul>
        <FulfilmentActions fulfilmentId={o.id} status={o.status} />
        {o.trackingNumber && (
          <p className="text-sm text-ink-muted">
            Tracking: {o.carrier} {o.trackingNumber}
          </p>
        )}
      </div>
      <aside className="space-y-4">
        <div className="card space-y-1 p-4 text-sm">
          <p className="font-medium">Ship to</p>
          {a ? (
            <address className="not-italic text-ink-soft">
              {[a.name, a.line1, a.line2, `${a.city ?? ''} ${a.state ?? ''} ${a.postal_code ?? ''}`]
                .filter(Boolean)
                .map((l) => (
                  <span key={l} className="block">
                    {l}
                  </span>
                ))}
            </address>
          ) : (
            <p className="text-ink-muted">Address pending</p>
          )}
          <p className="pt-2 text-xs text-ink-muted">
            Dispatch by{' '}
            {o.estimatedDispatchDate
              ? new Date(o.estimatedDispatchDate).toLocaleDateString('en-AU', {
                  dateStyle: 'medium',
                })
              : '—'}
          </p>
        </div>
        <dl className="card space-y-1 p-4 text-sm">
          <div className="flex justify-between">
            <dt>Items</dt>
            <dd>{formatPrice(o.subtotalCents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Shipping charged</dt>
            <dd>{formatPrice(o.shippingCents)}</dd>
          </div>
          <div className="flex justify-between text-ink-muted">
            <dt>Platform commission</dt>
            <dd>−{formatPrice(o.platformCommissionCents)}</dd>
          </div>
          <div className="flex justify-between border-t border-stone/70 pt-1 font-semibold">
            <dt>Your payout</dt>
            <dd>{formatPrice(o.sellerNetCents)}</dd>
          </div>
          <p className="pt-1 text-xs text-ink-muted">
            Transfer:{' '}
            {o.transferStatus === 'created'
              ? 'sent to your Stripe account'
              : o.transferStatus === 'skipped'
                ? 'waiting for payout setup'
                : o.transferStatus}
          </p>
        </dl>
        <Link
          href={`/packing-slip/${o.id}`}
          target="_blank"
          className="flex min-h-[52px] items-center justify-center border border-ink text-[11px] uppercase tracking-label hover:bg-ink hover:text-ground"
        >
          Print packing slip
        </Link>
      </aside>
    </div>
  );
}
