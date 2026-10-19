import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { logoutAction } from '@/lib/actions/auth';
import { accountSummary } from '@/lib/queries/account-home';
import { getBuyerOrders } from '@/lib/queries/account';
import { accountItems } from '@/lib/account/nav';
import { StatusDot } from '@/components/account/Parcel';
import { Img as Image } from '@/components/ui/Img';
import { stageOf } from '@/lib/account/progress';
import { formatPrice } from '@/lib/domain/money';

export const metadata = { title: 'Your account' };

/**
 * Phone: the account home is the menu — "Hi, {name}", the In progress card, then rows with values.
 * Desktop: the sections are in the left column, so this shows what's in progress and recent orders.
 */
export default async function AccountPage() {
  const user = await requireUser('/account');
  const [summary, orders] = await Promise.all([accountSummary(user), getBuyerOrders(user)]);
  const active = summary.active;
  return (
    <div className="max-w-3xl">
      <div className="md:hidden">
        <p className="font-display text-[40px] leading-none" data-testid="account-hi-phone">
          Hi, {summary.firstName}
        </p>
        <p className="mt-2 truncate text-[13px] text-muted">{summary.email}</p>
      </div>

      {active ? (
        <Link
          href={`/account/orders/${active.orderNumber}`}
          className="mt-6 block bg-stone px-4 py-4 md:mt-0 md:px-6 md:py-5"
          data-testid="in-progress-card"
        >
          <span className="flex items-baseline justify-between">
            <span className="text-[11px] uppercase tracking-label">In progress</span>
            <span className="text-[12px] text-muted">{active.orderNumber} ›</span>
          </span>
          <ul className="mt-3 space-y-3" role="list">
            {active.pieces.map((p) => (
              <li key={p.id} className="flex items-center gap-3">
                <span className="relative aspect-4/5 w-11 shrink-0 overflow-hidden bg-stone-light">
                  {p.imageUrl && (
                    <Image src={p.imageUrl} alt="" fill sizes="44px" className="object-cover" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px]">{p.title}</span>
                  <span className="block truncate text-[12px] text-muted">{p.maker}</span>
                </span>
                <StatusDot stage={p.stage} />
              </li>
            ))}
          </ul>
        </Link>
      ) : (
        <p className="mt-6 hidden text-[14px] text-muted md:mt-0 md:block">
          Nothing on its way right now.
        </p>
      )}

      {/* Phone: the sections as rows with their values on the right. */}
      <nav className="mt-6 md:hidden" aria-label="Account">
        <ul className="border-t border-line" role="list">
          {accountItems(summary).map((i) => (
            <li key={i.href} className="border-b border-line">
              <Link
                href={i.href}
                className="flex min-h-[52px] items-center justify-between gap-3 text-[15px]"
                data-testid={i.testId ? `${i.testId}-row` : undefined}
              >
                <span>{i.label}</span>
                <span className="text-[13px] text-muted">{i.value ? `${i.value} ` : ''}›</span>
              </Link>
            </li>
          ))}
        </ul>
        <form action={logoutAction} className="mt-4">
          <button className="min-h-[44px] text-[14px] text-muted">Sign out</button>
        </form>
      </nav>

      {/* Desktop: recent orders. */}
      <section className="mt-10 hidden md:block" aria-label="Recent orders">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-[28px] leading-none">Recent orders</h2>
          <Link
            href="/account/orders"
            className="text-[12px] uppercase tracking-label underline underline-offset-[5px]"
          >
            All orders
          </Link>
        </div>
        {orders.length === 0 ? (
          <p className="mt-4 text-[14px] text-muted">
            No orders yet.{' '}
            <Link href="/discover" className="underline underline-offset-[3px]">
              Start exploring
            </Link>
          </p>
        ) : (
          <ul className="mt-4 border-t border-line" role="list">
            {orders.slice(0, 4).map((o) => (
              <li key={o.id} className="border-b border-line">
                <Link
                  href={`/account/orders/${o.orderNumber}`}
                  className="flex min-h-[56px] items-center justify-between gap-4 text-[14px] hover:bg-surface"
                >
                  <span>{o.orderNumber}</span>
                  <span className="flex flex-1 flex-wrap gap-3">
                    {o.fulfilments.map((f) => (
                      <StatusDot key={f.id} stage={stageOf(f.status, f.isMto)} />
                    ))}
                  </span>
                  <span className="text-muted">{formatPrice(o.totalCents)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
