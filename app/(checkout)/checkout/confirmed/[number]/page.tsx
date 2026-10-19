import Link from 'next/link';
import { getCartSessionId } from '@/lib/actions/util';
import { getSessionUser } from '@/lib/auth/session';
import { sql } from '@/lib/db';
import { log } from '@/lib/log';
import { formatArrival } from '@/lib/shipping/estimate';
import { getReturnPolicy } from '@/lib/returns/policy';
import { onPaymentIntentSucceeded } from '@/lib/services/webhook';
import { Img as Image } from '@/components/ui/Img';
import { Monogram } from '@/components/ui/Monogram';
import { InstallTriggerOnMount } from '@/components/install/InstallTriggerOnMount';

export const metadata = { title: 'Thank you', robots: { index: false } };
export const dynamic = 'force-dynamic';

interface OrderRow {
  id: string;
  orderNumber: string;
  status: string;
  buyerEmail: string;
  buyerName: string | null;
  buyerUserId: string | null;
  checkoutSession: string | null;
  stripePaymentIntentId: string | null;
  accountCreated: boolean;
}

const load = (number: string) =>
  sql()<OrderRow[]>`
    select id, order_number, status, buyer_email, buyer_name, buyer_user_id, checkout_session, stripe_payment_intent_id,
      account_created
    from public.orders where order_number = ${number}`;

const nextStep: Record<string, (maker: string) => string> = {
  made_to_order: (m) => `${m} starts making yours this week.`,
  ready_to_ship: (m) => `${m} is packing it now.`,
  one_of_one: (m) => `It’s yours. ${m} has taken it off the rail.`,
};

/**
 * "Thank you": shown to the browser that paid (its bag session) or the signed-in buyer. If the
 * buyer arrives before the webhook (e.g. back from Afterpay), the payment is checked with Stripe
 * here and the order finalised the same way the webhook would.
 */
export default async function ConfirmedPage({ params }: { params: { number: string } }) {
  const number = decodeURIComponent(params.number);
  let [order] = await load(number);
  const user = await getSessionUser();
  const session = getCartSessionId();
  const allowed =
    order &&
    ((session && order.checkoutSession === session) ||
      (user && (order.buyerUserId === user.id || user.role === 'admin')));
  if (!order || !allowed) {
    return (
      <div className="mx-auto max-w-xl px-6 pt-16 text-center">
        <h1 className="text-[40px] leading-none">We couldn’t find that order</h1>
        <p className="mt-3 text-[14px] text-muted">
          If you were charged, your receipt email has the details. Signing in shows all your orders.
        </p>
        <Link href="/login?next=/account/orders" className="link mt-6 inline-block text-[14px]">
          Sign in
        </Link>
      </div>
    );
  }
  if (order.status === 'pending' && order.stripePaymentIntentId) {
    await onPaymentIntentSucceeded(order.stripePaymentIntentId).catch((err) =>
      log.warn({ err: String(err), order: order!.id }, 'confirm on return failed'),
    );
    [order] = await load(number);
  }
  if (order!.status === 'pending') {
    return (
      <div className="mx-auto max-w-xl px-6 pt-16 text-center">
        <meta httpEquiv="refresh" content="2" />
        <Monogram className="mx-auto h-12 w-12 text-ink" />
        <h1 className="mt-6 text-[40px] leading-none">Finishing your payment…</h1>
        <p className="mt-3 text-[14px] text-muted" role="status">
          This usually takes a few seconds. This page updates by itself.
        </p>
      </div>
    );
  }

  const items = await sql()<
    {
      id: string;
      title: string;
      maker: string;
      productType: string;
      imageUrl: string | null;
      from: Date | null;
      to: Date | null;
      fulfilmentId: string;
      returnSummary: string | null;
    }[]
  >`
    select oi.id, oi.product_title as title, m.display_name as maker, oi.product_type, oi.image_url,
      oi.return_policy->>'summary' as return_summary,
      f.estimated_delivery_from as from, f.estimated_delivery_to as to, f.id as fulfilment_id
    from public.order_items oi join public.fulfilments f on f.id = oi.fulfilment_id
    join public.makers m on m.id = oi.maker_id
    where oi.order_id = ${order!.id} order by f.created_at, oi.created_at`;
  const parcels = new Set(items.map((i) => i.fulfilmentId)).size;
  const first = (order!.buyerName ?? '').trim().split(/\s+/)[0];

  return (
    <div className="mx-auto max-w-[640px] px-5 pb-20 pt-10 md:pt-16" data-testid="order-confirmed">
      <InstallTriggerOnMount trigger="order_placed" />
      <Monogram className="h-12 w-12 text-ink" />
      <h1 className="mt-6 text-[48px] leading-[1] md:text-[56px]">
        Thank you{first ? `, ${first}` : ''}.
      </h1>
      <p className="mt-3 text-[15px] text-muted">
        Order {order!.orderNumber} is in. Your receipt is on its way to {order!.buyerEmail}.
      </p>

      <ul className="mt-10 divide-y divide-line border-y border-line" role="list">
        {items.map((i, n) => (
          <li
            key={i.id}
            className="confirm-item flex gap-4 py-5"
            style={{ animationDelay: `${n * 90}ms` }}
            data-testid="confirmed-item"
          >
            <span className="relative aspect-4/5 w-[88px] shrink-0 overflow-hidden bg-stone">
              {i.imageUrl && (
                <Image src={i.imageUrl} alt="" fill sizes="88px" className="object-cover" />
              )}
            </span>
            <span className="min-w-0 text-[14px]">
              <span className="block">
                {i.title} · {i.maker}
              </span>
              <span className="mt-1 block text-muted">
                {(nextStep[i.productType] ?? nextStep.ready_to_ship!)(i.maker)}
              </span>
              {i.from && i.to && (
                <span className="mt-1 block text-[13px]">
                  Arrives {formatArrival(new Date(i.from), new Date(i.to))}
                </span>
              )}
              <span className="mt-1 block text-[12px] text-muted-2" data-testid="confirmed-returns">
                {i.returnSummary ?? getReturnPolicy(i.productType).summary}
              </span>
            </span>
          </li>
        ))}
      </ul>

      {order!.accountCreated && (
        <p className="mt-8 bg-stone p-4 text-[14px] leading-relaxed" data-testid="account-ready">
          Your account is ready. Track all {parcels} {parcels === 1 ? 'parcel' : 'parcels'}, message
          makers and save your sizes in one place. We’ve emailed you a sign-in link.
        </p>
      )}

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <Link
          href={`/account/orders/${order!.orderNumber}`}
          className="glass-dark flex min-h-[52px] items-center justify-center text-[11px] uppercase tracking-[0.18em] text-ground"
          data-testid="track-order"
        >
          Track your order
        </Link>
        <Link
          href="/"
          className="flex min-h-[52px] items-center justify-center border border-ink text-[11px] uppercase tracking-[0.18em]"
        >
          Keep exploring
        </Link>
      </div>
    </div>
  );
}
