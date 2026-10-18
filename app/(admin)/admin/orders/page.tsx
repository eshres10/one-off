import { sql } from '@/lib/db';
import { formatPrice } from '@/lib/domain/money';
import { StatusPill } from '@/components/ui/Badge';
import { RefundForm } from '@/components/admin/RefundForm';

export const metadata = { title: 'Orders' };

export default async function AdminOrdersPage({ searchParams }: { searchParams: { q?: string } }) {
  const q = (searchParams.q ?? '').trim().slice(0, 100);
  const orders = await sql()<
    {
      id: string;
      orderNumber: string;
      status: string;
      buyerEmail: string;
      totalCents: number;
      platformFeeTotalCents: number;
      refundedCents: number;
      createdAt: Date;
    }[]
  >`
    select id, order_number, status, buyer_email, total_cents, platform_fee_total_cents, refunded_cents, created_at
    from public.orders where status <> 'pending'
      ${q ? sql()`and (order_number ilike ${'%' + q + '%'} or buyer_email ilike ${'%' + q + '%'})` : sql()``}
    order by created_at desc limit 50`;
  const ids = orders.map((o) => o.id);
  const items = ids.length
    ? await sql()<
        {
          id: string;
          orderId: string;
          productTitle: string;
          variantLabel: string;
          makerName: string;
          lineTotalCents: number;
          refundedCents: number;
          fulfilmentStatus: string;
          transferStatus: string;
        }[]
      >`
        select oi.id, oi.order_id, oi.product_title, oi.variant_label, m.display_name as maker_name, oi.line_total_cents, oi.refunded_cents,
               oi.fulfilment_status, f.transfer_status
        from public.order_items oi join public.makers m on m.id = oi.maker_id join public.fulfilments f on f.id = oi.fulfilment_id
        where oi.order_id in ${sql()(ids)}`
    : [];
  const disputes = await sql()<
    {
      id: string;
      stripeDisputeId: string;
      amountCents: number;
      reason: string | null;
      status: string;
      orderNumber: string | null;
      createdAt: Date;
      evidenceDueBy: Date | null;
    }[]
  >`
    select d.id, d.stripe_dispute_id, d.amount_cents, d.reason, d.status, o.order_number, d.created_at, d.evidence_due_by
    from public.disputes d left join public.orders o on o.id = d.order_id order by d.created_at desc limit 20`;
  const transfers = await sql()<{ status: string; n: number; cents: number }[]>`
    select transfer_status as status, count(*)::int as n, coalesce(sum(seller_net_cents), 0)::int as cents
    from public.fulfilments f join public.orders o on o.id = f.order_id where o.status <> 'pending' group by 1 order by 1`;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-[40px] leading-none md:text-[48px]">Orders, refunds & payouts</h1>
        <form className="flex gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="Order number or email"
            aria-label="Search orders"
            className="input w-64 py-2 text-sm"
          />
          <button className="min-h-[44px] border border-ink px-4 text-[10px] uppercase tracking-label">
            Search
          </button>
        </form>
      </div>
      <section className="grid gap-3 sm:grid-cols-4">
        {transfers.map((t) => (
          <div key={t.status} className="card p-4 text-sm">
            <p className="text-xs capitalize text-ink-muted">Transfers {t.status}</p>
            <p className="font-display text-xl">{t.n}</p>
            <p className="text-xs text-ink-muted">{formatPrice(t.cents)} to makers</p>
          </div>
        ))}
      </section>
      {disputes.length > 0 && (
        <section>
          <h2 className="mb-3 text-[28px] leading-none">Disputes</h2>
          <ul
            className="divide-y divide-stone/70 rounded-2xl border border-alert/40 bg-white text-sm"
            role="list"
          >
            {disputes.map((d) => (
              <li key={d.id} className="flex justify-between px-4 py-2.5">
                <span>
                  {d.orderNumber ?? 'Unknown order'} · {formatPrice(d.amountCents)} · {d.reason}
                  {d.evidenceDueBy && (
                    <span
                      className={`ml-2 text-[11px] uppercase tracking-label ${new Date(d.evidenceDueBy).getTime() - Date.now() < 3 * 86_400_000 ? 'text-error' : 'text-muted-2'}`}
                    >
                      Evidence due{' '}
                      {new Date(d.evidenceDueBy).toLocaleDateString('en-AU', {
                        dateStyle: 'medium',
                      })}
                    </span>
                  )}
                </span>
                <StatusPill status={d.status} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <ul className="space-y-4" role="list">
        {orders.map((o) => (
          <li key={o.id} className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone/70 bg-stone-light/40 px-4 py-2.5 text-sm">
              <span>
                <span className="font-medium">{o.orderNumber}</span> · {o.buyerEmail} ·{' '}
                {new Date(o.createdAt).toLocaleDateString('en-AU')}
              </span>
              <span className="flex items-center gap-2">
                {formatPrice(o.totalCents)}{' '}
                <span className="text-xs text-ink-muted">
                  (fee {formatPrice(o.platformFeeTotalCents)})
                </span>
                {o.refundedCents > 0 && (
                  <span className="text-xs text-alert">−{formatPrice(o.refundedCents)}</span>
                )}
                <StatusPill status={o.status} />
              </span>
            </div>
            <ul className="divide-y divide-stone/60 text-sm" role="list">
              {items
                .filter((i) => i.orderId === o.id)
                .map((i) => (
                  <li
                    key={i.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
                  >
                    <span>
                      {i.productTitle} ({i.variantLabel}) · {i.makerName} ·{' '}
                      {formatPrice(i.lineTotalCents)}
                      <span className="ml-2 text-xs text-ink-muted">
                        transfer {i.transferStatus}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <StatusPill status={i.fulfilmentStatus} />
                      <RefundForm
                        orderItemId={i.id}
                        remainingCents={i.lineTotalCents - i.refundedCents}
                      />
                    </span>
                  </li>
                ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
