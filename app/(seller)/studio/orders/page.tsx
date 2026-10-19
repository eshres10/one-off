import Link from 'next/link';
import { z } from 'zod';
import { requireSeller } from '@/lib/auth/session';
import { formatPrice } from '@/lib/domain/money';
import { daysUntil, shipByLabel } from '@/lib/studio/format';
import {
  ORDER_TABS,
  countStudioOrders,
  getStudioOrder,
  listStudioOrders,
  type OrderTab,
  type StudioOrderRow,
} from '@/lib/services/studio-orders';
import { OrderPanel, OrderPanelTitle } from '@/components/studio/OrderPanel';
import { RouteSheet } from '@/components/studio/RouteSheet';
import { OrderStatusPill } from '@/components/studio/StatusPill';
import { Img as Image } from '@/components/ui/Img';
import { countClaimsNeedingAttention } from '@/lib/services/claims';
import { firstOrderChecklist } from '@/lib/services/studio-states';
import { NoOrdersYet } from '@/components/studio/states/NoOrdersYet';
import { env } from '@/lib/env';

export const metadata = { title: 'Orders · Studio' };

const placed = (d: Date) =>
  new Date(d).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Australia/Melbourne',
  });

function action(o: StudioOrderRow) {
  if (['paid', 'preparing', 'ready'].includes(o.status) && !(o.isMto && o.status === 'paid'))
    return 'Ship';
  if (o.isMto && ['paid', 'making'].includes(o.status)) return 'Update';
  return 'View';
}

function ShipBy({ o }: { o: StudioOrderRow }) {
  const d = daysUntil(o.shipBy);
  const open = !['shipped', 'delivered', 'completed', 'refunded', 'issue'].includes(o.status);
  return (
    <span className={open && d !== null && d <= 0 ? 'text-alert' : ''} data-testid="ship-by">
      {open ? shipByLabel(o.shipBy) : '—'}
    </span>
  );
}

export default async function StudioOrdersPage({
  searchParams,
}: {
  searchParams: { tab?: string; order?: string };
}) {
  const seller = await requireSeller();
  const tab = (
    ORDER_TABS.some((t) => t.key === searchParams.tab) ? searchParams.tab : 'to-ship'
  ) as OrderTab;
  const orderId = z.string().uuid().safeParse(searchParams.order);
  const problems = await countClaimsNeedingAttention(seller.makerId);
  const [rows, counts, open] = await Promise.all([
    listStudioOrders(seller, tab),
    countStudioOrders(seller),
    orderId.success ? getStudioOrder(seller, orderId.data) : Promise.resolve(null),
  ]);
  // Before the first ever order: the checklist that helps get one.
  const everOrdered = Object.values(counts).some((n) => n > 0);
  const checklist = everOrdered ? null : await firstOrderChecklist(seller.makerId!);
  const href = (id?: string) => `/studio/orders?tab=${tab}${id ? `&order=${id}` : ''}`;

  return (
    <div>
      <h1 className="text-[40px] leading-none md:text-[56px]">Orders</h1>
      <nav
        aria-label="Order status"
        className="no-scrollbar -mx-4 mt-6 flex gap-6 overflow-x-auto border-b border-line px-4 md:mx-0 md:px-0"
      >
        {ORDER_TABS.map((t) => (
          <Link
            key={t.key}
            href={`/studio/orders?tab=${t.key}`}
            aria-current={tab === t.key ? 'page' : undefined}
            data-testid={`orders-tab-${t.key}`}
            className={`-mb-px flex min-h-[44px] shrink-0 items-center gap-1.5 border-b text-[11px] uppercase tracking-label ${tab === t.key ? 'border-ink' : 'border-transparent text-muted-2 hover:text-ink'}`}
          >
            {t.label} <span className="text-muted-2">({counts[t.key]})</span>
          </Link>
        ))}
        <Link
          href="/studio/claims"
          data-testid="orders-tab-problems"
          className="-mb-px flex min-h-[44px] shrink-0 items-center gap-1.5 border-b border-transparent text-[11px] uppercase tracking-label text-muted-2 hover:text-ink"
        >
          Problems <span className={problems ? 'text-alert' : 'text-muted-2'}>({problems})</span>
        </Link>
      </nav>

      {rows.length === 0 && checklist ? (
        <NoOrdersYet list={checklist} shopUrl={`${env().APP_URL}/makers/${checklist.slug}`} />
      ) : rows.length === 0 ? (
        <p className="py-16 text-center text-[14px] text-muted">
          {tab === 'to-ship' ? 'Nothing to ship. Nice work.' : 'No orders here yet.'}
        </p>
      ) : (
        <>
          <table
            className="mt-2 hidden w-full text-left text-[13px] md:table"
            data-testid="orders-table"
          >
            <thead>
              <tr className="border-b border-line text-[10px] uppercase tracking-label text-muted-2">
                <th scope="col" className="py-3 font-normal">
                  Order
                </th>
                <th scope="col" className="py-3 font-normal">
                  Piece
                </th>
                <th scope="col" className="py-3 font-normal">
                  Buyer
                </th>
                <th scope="col" className="py-3 font-normal">
                  Ship by
                </th>
                <th scope="col" className="py-3 text-right font-normal">
                  Total
                </th>
                <th scope="col" className="py-3 pl-6 font-normal">
                  Status
                </th>
                <th scope="col" className="py-3 font-normal">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr
                  key={o.id}
                  className="border-b border-line hover:bg-stone/60"
                  data-testid="order-row"
                >
                  <td className="py-3 pr-4 align-middle">
                    <span className="block">#{o.orderNumber.replace(/^OO-/, '')}</span>
                    <span className="text-[12px] text-muted-2">{placed(o.placedAt)}</span>
                  </td>
                  <td className="py-3 pr-4">
                    <span className="flex items-center gap-3">
                      <span className="relative aspect-4/5 w-10 shrink-0 overflow-hidden bg-stone">
                        {o.imageUrl && (
                          <Image
                            src={o.imageUrl}
                            alt=""
                            fill
                            sizes="40px"
                            className="object-cover object-top"
                          />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate">
                          {o.title}
                          {o.itemCount > 1 ? ` +${o.itemCount - 1}` : ''}
                        </span>
                        <span className="text-[12px] text-muted-2">
                          {o.variantLabel.replace(/^AU /, 'Size ')}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <span className="block">{o.buyerName ?? 'Guest'}</span>
                    <span className="text-[12px] text-muted-2">
                      {[o.suburb, o.state].filter(Boolean).join(' ')}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <ShipBy o={o} />
                  </td>
                  <td className="py-3 text-right tabular-nums">{formatPrice(o.totalCents)}</td>
                  <td className="py-3 pl-6">
                    <OrderStatusPill status={o.status} mto={o.isMto} />
                  </td>
                  <td className="py-3 text-right">
                    <Link
                      href={href(o.id)}
                      scroll={false}
                      className="inline-flex min-h-[44px] items-center text-[11px] uppercase tracking-label underline underline-offset-[6px]"
                      data-testid="order-open"
                    >
                      {action(o)}
                      <span className="sr-only"> order {o.orderNumber}</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul className="mt-4 space-y-2 md:hidden" role="list">
            {rows.map((o) => (
              <li key={o.id}>
                <Link
                  href={href(o.id)}
                  scroll={false}
                  className="flex gap-3 border border-line bg-surface p-3"
                  data-testid="order-card"
                >
                  <span className="relative aspect-4/5 w-14 shrink-0 overflow-hidden bg-stone">
                    {o.imageUrl && (
                      <Image
                        src={o.imageUrl}
                        alt=""
                        fill
                        sizes="56px"
                        className="object-cover object-top"
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 text-[13px]">
                    <span className="flex items-start justify-between gap-2">
                      <span className="truncate">{o.title}</span>
                      <OrderStatusPill status={o.status} mto={o.isMto} />
                    </span>
                    <span className="block text-[12px] text-muted-2">
                      #{o.orderNumber.replace(/^OO-/, '')} · {o.buyerName ?? 'Guest'} ·{' '}
                      {formatPrice(o.totalCents)}
                    </span>
                    <span className="mt-1 block text-[12px]">
                      Ship by <ShipBy o={o} />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {open && (
        <RouteSheet
          closeHref={href()}
          title={<OrderPanelTitle order={open} />}
          testId="order-sheet"
        >
          <OrderPanel order={open} />
        </RouteSheet>
      )}
    </div>
  );
}
