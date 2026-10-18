import Link from 'next/link';
import { Img as Image } from '@/components/ui/Img';
import { sql } from '@/lib/db';
import { formatPrice } from '@/lib/domain/money';
import { formatDateRange } from '@/lib/domain/leadTime';
import { ButtonLink } from '@/components/ui/Button';

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
        <h1 className="text-[40px] leading-none md:text-[48px]">We couldn’t find that order</h1>
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
        <h1 className="text-[40px] leading-none md:text-[48px]">Confirming your payment…</h1>
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
      productType: string;
      makerName: string;
      from: Date;
      to: Date;
    }[]
  >`
    select oi.id, oi.product_title, oi.variant_label, oi.quantity, oi.line_total_cents, oi.image_url, oi.product_type, m.display_name as maker_name,
           f.estimated_delivery_from as from, f.estimated_delivery_to as to
    from public.order_items oi join public.makers m on m.id = oi.maker_id join public.fulfilments f on f.id = oi.fulfilment_id
    where oi.order_id = ${order.id} order by m.display_name`;
  const byMaker = new Map<string, Array<(typeof items)[number]>>();
  for (const i of items) byMaker.set(i.makerName, [...(byMaker.get(i.makerName) ?? []), i]);

  return (
    <div className="mx-auto max-w-3xl px-4 pt-12 md:pt-20" data-testid="order-confirmation">
      <p className="eyebrow">Order confirmed</p>
      <h1 className="mt-3 text-[64px] leading-[0.92] md:text-[96px]">Thank you</h1>
      <p className="mt-4 text-[15px] text-muted">
        Order{' '}
        <span className="text-ink" data-testid="order-number">
          {order.orderNumber}
        </span>{' '}
        is confirmed. We’ve emailed a receipt to {order.buyerEmail}.
      </p>

      <div className="mt-10 space-y-8">
        {Array.from(byMaker.entries()).map(([maker, group]) => (
          <section
            key={maker}
            aria-label={`Ships from ${maker}`}
            className="border-t border-ink pt-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[11px] uppercase tracking-label">Ships from {maker}</p>
              <p className="text-[12px] text-muted-2" data-dynamic>
                Estimated delivery{' '}
                {formatDateRange(new Date(group[0]!.from), new Date(group[0]!.to))}
              </p>
            </div>
            <ul role="list">
              {group.map((i) => (
                <li key={i.id} className="flex gap-4 border-b border-line py-4">
                  <span className="relative aspect-4/5 w-16 shrink-0 overflow-hidden bg-stone-light">
                    {i.imageUrl && (
                      <Image
                        src={i.imageUrl}
                        alt={i.productTitle}
                        fill
                        sizes="64px"
                        className="object-cover object-top"
                      />
                    )}
                  </span>
                  <div className="min-w-0 flex-1 text-[13px]">
                    <p className="text-[14px]">{i.productTitle}</p>
                    <p className="text-muted">
                      {i.variantLabel.replace(/^AU /, 'Size ')} × {i.quantity}
                    </p>
                  </div>
                  <p className="text-[14px]">{formatPrice(i.lineTotalCents)}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <dl className="mt-6 space-y-1.5 text-[14px]">
        <div className="flex justify-between">
          <dt>Subtotal</dt>
          <dd>{formatPrice(order.subtotalCents)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Shipping</dt>
          <dd>{formatPrice(order.shippingTotalCents)}</dd>
        </div>
        <div className="flex justify-between border-t border-ink pt-2 text-[16px]">
          <dt>Total paid</dt>
          <dd>{formatPrice(order.totalCents)}</dd>
        </div>
      </dl>

      <section className="mt-12 bg-stone-light p-6">
        <h2 className="text-[28px] leading-none">What happens next</h2>
        <ol className="mt-4 space-y-2 text-[14px] text-text2">
          <li>
            1 · {byMaker.size > 1 ? `Each of your ${byMaker.size} makers` : 'Your maker'} prepares
            your piece
            {items.some((i) => i.productType === 'made_to_order')
              ? ' — made-to-order pieces are cut and sewn for you first'
              : ''}
            .
          </li>
          <li>2 · You’ll get an email with tracking as each parcel ships.</li>
          <li>3 · Questions about fit or timing? Message the maker from your order.</li>
        </ol>
      </section>

      <div className="mt-8 flex flex-wrap gap-3">
        <ButtonLink href="/account/orders">View your orders</ButtonLink>
        <ButtonLink href="/" variant="secondary">
          Keep exploring
        </ButtonLink>
      </div>
      <p className="mt-6 text-[12px] text-muted-2">
        Checked out as a guest?{' '}
        <Link href="/login?next=/account/orders" className="link">
          Sign in with {order.buyerEmail}
        </Link>{' '}
        to track this order.
      </p>
    </div>
  );
}
