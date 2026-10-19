import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/session';
import { sql } from '@/lib/db';
import { formatPrice } from '@/lib/domain/money';
import { RETURN_STATUS_LABEL, type ReturnStatus } from '@/lib/returns/status';
import { listReturns } from '@/lib/services/returns';
import { AdminReturnActions } from '@/components/admin/returns/AdminReturnActions';

export const metadata = { title: 'Returns' };

const day = (d: Date | null) =>
  d
    ? new Date(d).toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'short',
        timeZone: 'Australia/Sydney',
      })
    : '—';

const STATUSES = Object.keys(RETURN_STATUS_LABEL) as ReturnStatus[];

/** Every change-of-mind return, filterable by status and maker, with One Off's overrides. */
export default async function AdminReturnsPage({
  searchParams,
}: {
  searchParams: { status?: string; maker?: string };
}) {
  await requireAdmin();
  const status = STATUSES.includes(searchParams.status as ReturnStatus)
    ? searchParams.status!
    : null;
  const makerId = /^[0-9a-f-]{36}$/i.test(searchParams.maker ?? '') ? searchParams.maker! : null;
  const [returns, makers] = await Promise.all([
    listReturns({ status, makerId }),
    sql()<{ id: string; displayName: string }[]>`
      select distinct m.id, m.display_name from public.returns r join public.makers m on m.id = r.maker_id
      order by m.display_name`,
  ]);
  return (
    <div className="space-y-6">
      <h1 className="text-[40px] leading-none md:text-[48px]">Returns</h1>
      <form className="flex flex-wrap items-end gap-3 text-[13px]" data-testid="returns-filters">
        <label>
          <span className="block text-[11px] uppercase tracking-label text-muted-2">Status</span>
          <select name="status" defaultValue={status ?? ''} className="input mt-1">
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {RETURN_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="block text-[11px] uppercase tracking-label text-muted-2">Maker</span>
          <select name="maker" defaultValue={makerId ?? ''} className="input mt-1">
            <option value="">All</option>
            {makers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
          </select>
        </label>
        <button className="min-h-[44px] border border-ink px-4 text-[11px] uppercase tracking-label">
          Filter
        </button>
      </form>
      {returns.length === 0 ? (
        <p className="text-[14px] text-muted">No returns.</p>
      ) : (
        <ul
          className="divide-y divide-line border-y border-line"
          role="list"
          data-testid="admin-returns"
        >
          {returns.map((r) => (
            <li
              key={r.id}
              className="grid gap-3 py-4 text-[13px] md:grid-cols-[minmax(0,1fr)_200px_320px]"
              data-testid="admin-return-row"
            >
              <div className="min-w-0">
                <p className="text-[14px]">
                  {r.number} · {r.productTitle}
                </p>
                <p className="text-muted">
                  {r.makerName} · {r.buyerFirstName} · order {r.orderNumber} ·{' '}
                  {formatPrice(r.lineTotalCents)}
                </p>
                {r.makerNote && <p className="mt-1">Maker: “{r.makerNote}”</p>}
                {r.adminNote && <p className="mt-1 text-muted">One Off: {r.adminNote}</p>}
                {r.claimId && (
                  <Link
                    href={`/admin/claims/${r.claimId}`}
                    className="mt-1 inline-block underline underline-offset-[3px]"
                  >
                    Open the case
                  </Link>
                )}
              </div>
              <div>
                <p>{RETURN_STATUS_LABEL[r.status]}</p>
                <p className="text-muted">Started {day(r.requestedAt)}</p>
                <p className="text-muted">
                  {r.tracking ? `Tracking ${r.tracking}` : 'No tracking'}
                </p>
                {r.deliveredAt && <p className="text-muted">Delivered back {day(r.deliveredAt)}</p>}
                {r.refundedAt && (
                  <p className="text-muted">
                    Refunded {day(r.refundedAt)}
                    {r.refundAmount ? ` · ${formatPrice(r.refundAmount)}` : ''}
                    {r.refundSource ? ` · ${r.refundSource}` : ''}
                  </p>
                )}
              </div>
              <div>
                {['requested', 'in_transit'].includes(r.status) && (
                  <AdminReturnActions returnId={r.id} canMarkDelivered={!r.deliveredAt} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
