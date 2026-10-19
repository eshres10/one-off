import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { getBuyerOrders } from '@/lib/queries/account';
import { EmptyState } from '@/components/ui/EmptyState';
import { ButtonLink } from '@/components/ui/Button';
import { Img as Image } from '@/components/ui/Img';
import { StatusDot } from '@/components/account/Parcel';
import { stageOf } from '@/lib/account/progress';
import { formatPrice } from '@/lib/domain/money';
import { SITE } from '@/lib/site/config';

export const metadata = { title: 'Orders' };

const placed = (d: Date) =>
  new Date(d).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: SITE.adminTimeZone,
  });

export default async function OrdersPage() {
  const user = await requireUser('/account/orders');
  const orders = await getBuyerOrders(user);
  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-[40px] leading-none md:text-[44px]">Orders</h1>
      {orders.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No orders yet"
            action={<ButtonLink href="/">Start exploring</ButtonLink>}
          >
            Checked out as a guest? Sign in with a link sent to the same email and your orders will
            appear here.
          </EmptyState>
        </div>
      ) : (
        <div className="mt-6">
          {orders.map((o) => (
            <section
              key={o.id}
              className="border-t border-line py-6"
              aria-label={`Order ${o.orderNumber}`}
              data-testid="buyer-order"
            >
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <p className="text-[15px]">{o.orderNumber}</p>
                  <p className="text-[13px] text-muted">
                    Placed {placed(o.paidAt ?? o.createdAt)} · {formatPrice(o.totalCents)}
                  </p>
                </div>
                <Link
                  href={`/account/orders/${o.orderNumber}`}
                  className="min-h-[44px] shrink-0 pt-1 text-[12px] uppercase tracking-label underline underline-offset-[5px]"
                  data-testid="view-order"
                >
                  View order
                </Link>
              </div>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2" role="list">
                {o.fulfilments.flatMap((f) =>
                  f.items.map((i) => (
                    <li key={i.id}>
                      <Link
                        href={`/account/orders/${o.orderNumber}`}
                        className="flex gap-3 bg-surface p-3 hover:bg-stone-light"
                        data-testid="order-item-card"
                      >
                        <span className="relative aspect-4/5 w-14 shrink-0 overflow-hidden bg-stone-light">
                          {i.imageUrl && (
                            <Image
                              src={i.imageUrl}
                              alt=""
                              fill
                              sizes="56px"
                              className="object-cover"
                            />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px]">{i.productTitle}</span>
                          <span className="block truncate text-[12px] text-muted">
                            {f.makerName}
                          </span>
                          <span className="mt-1.5 block">
                            <StatusDot
                              stage={
                                i.fulfilmentStatus === 'refunded'
                                  ? 'cancelled'
                                  : stageOf(f.status, f.isMto)
                              }
                            />
                          </span>
                        </span>
                      </Link>
                    </li>
                  )),
                )}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
