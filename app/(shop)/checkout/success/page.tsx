import Link from 'next/link';
import { Img as Image } from '@/components/ui/Img';
import { sql } from '@/lib/db';
import { formatPrice } from '@/lib/domain/money';
import { formatDateRange } from '@/lib/domain/leadTime';
import { ButtonLink } from '@/components/ui/Button';
import { CheckIcon } from '@/components/ui/icons';

export const metadata = { title: 'Order confirmed' };

interface Row {
  id: string;
  orderNumber: string;
  status: string;
  totalCents: number;
  subtotalCents: number;
  shippingTotalCents: number;
  buyerEmail: string;
}

/**
 * Shows the order state recorded by the verified webhook. The browser redirect alone never
 * marks an order paid; until the webhook lands we show a short "confirming" state.
 */
export default async function SuccessPage({
  searchParams,
}: {
  searchParams: { session_id?: string };
}) {
  const sessionId = searchParams.session_id ?? '';
  const [order] = sessionId
    ? await sql()<Row[]>`
        select id, order_number, status, total_cents, subtotal_cents, shipping_total_cents, buyer_email
        from public.orders where stripe_checkout_session_id = ${sessionId}`
    : [];
  if (!order) {
    return (
      <div className="container-page max-w-xl pt-16 text-center">
        <h1 className="text-3xl">We couldn’t find that order</h1>
        <p className="mt-2 text-ink-muted">
          If you were charged, your confirmation email has the details.
        </p>
      </div>
    );
  }
  if (order.status === 'pending') {
    return (
      <div className="container-page max-w-xl pt-16 text-center">
        <meta httpEquiv="refresh" content="2" />
        <h1 className="text-3xl">Confirming your payment…</h1>
        <p className="mt-2 text-ink-muted" role="status">
          This usually takes a few seconds. This page will update automatically.
        </p>
      </div>
    );
  }
  const items = await sql()<
    {
      id: string;
      productTitle: string;
      variantLabel: string;
      quantity: number;
      lineTotalCents: number;
      imageUrl: string | null;
      makerName: string;
      from: Date;
      to: Date;
    }[]
  >`
    select oi.id, oi.product_title, oi.variant_label, oi.quantity, oi.line_total_cents, oi.image_url, m.display_name as maker_name,
           f.estimated_delivery_from as from, f.estimated_delivery_to as to
    from public.order_items oi join public.makers m on m.id = oi.maker_id join public.fulfilments f on f.id = oi.fulfilment_id
    where oi.order_id = ${order.id} order by m.display_name`;
  const makers = new Set(items.map((i) => i.makerName));

  return (
    <div className="container-page max-w-2xl pt-12" data-testid="order-confirmation">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-moss-light text-moss">
        <CheckIcon />
      </span>
      <h1 className="mt-4 text-3xl sm:text-4xl">Thank you — your order is confirmed</h1>
      <p className="mt-2 text-ink-soft">
        Order{' '}
        <span className="font-medium" data-testid="order-number">
          {order.orderNumber}
        </span>
        . We’ve emailed a receipt to {order.buyerEmail}.{' '}
        {makers.size > 1
          ? `Your pieces ship separately from ${makers.size} makers.`
          : 'Your maker has been notified.'}
      </p>
      <ul
        className="mt-8 divide-y divide-stone/70 rounded-2xl border border-stone/70 bg-white"
        role="list"
      >
        {items.map((i) => (
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
                {i.variantLabel} × {i.quantity} · Ships from {i.makerName}
              </p>
              <p className="text-ink-muted">
                Estimated delivery {formatDateRange(new Date(i.from), new Date(i.to))}
              </p>
            </div>
            <p className="text-sm font-medium">{formatPrice(i.lineTotalCents)}</p>
          </li>
        ))}
      </ul>
      <dl className="mt-4 space-y-1 text-sm">
        <div className="flex justify-between">
          <dt>Subtotal</dt>
          <dd>{formatPrice(order.subtotalCents)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Shipping</dt>
          <dd>{formatPrice(order.shippingTotalCents)}</dd>
        </div>
        <div className="flex justify-between font-semibold">
          <dt>Total paid</dt>
          <dd>{formatPrice(order.totalCents)}</dd>
        </div>
      </dl>
      <div className="mt-8 flex flex-wrap gap-3">
        <ButtonLink href="/account/orders">View your orders</ButtonLink>
        <ButtonLink href="/" variant="secondary">
          Keep exploring
        </ButtonLink>
      </div>
      <p className="mt-6 text-xs text-ink-muted">
        Checked out as a guest?{' '}
        <Link href="/login?next=/account/orders" className="link">
          Sign in with {order.buyerEmail}
        </Link>{' '}
        to track this order.
      </p>
    </div>
  );
}
