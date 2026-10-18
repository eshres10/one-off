import { sql } from '@/lib/db';
import { assignCommissionAction, commissionAdminAction } from '@/lib/actions/admin';
import { formatPrice } from '@/lib/domain/money';
import { StatusPill } from '@/components/ui/Badge';

export const metadata = { title: 'Commissions' };

export default async function AdminCommissionsPage() {
  const rows = await sql()<
    {
      id: string;
      garmentType: string;
      occasion: string | null;
      status: string;
      budgetMinCents: number;
      budgetMaxCents: number;
      deadlineDate: Date | null;
      buyerEmail: string;
      makerName: string | null;
      makerId: string | null;
      adminNotes: string | null;
      notes: string | null;
      createdAt: Date;
      quoteTotal: number | null;
      quoteDeposit: number | null;
      quoteStatus: string | null;
    }[]
  >`
    select c.id, c.garment_type, c.occasion, c.status, c.budget_min_cents, c.budget_max_cents, c.deadline_date, u.email as buyer_email,
           m.display_name as maker_name, c.maker_id, c.admin_notes, c.notes, c.created_at,
           q.total_price_cents as quote_total, q.deposit_cents as quote_deposit, q.status as quote_status
    from public.commission_requests c join public.users u on u.id = c.buyer_user_id
    left join public.makers m on m.id = c.maker_id
    left join lateral (select * from public.commission_quotes q where q.commission_request_id = c.id order by created_at desc limit 1) q on true
    order by case c.status when 'accepted' then 0 when 'submitted' then 1 else 2 end, c.created_at desc`;
  const makers = await sql()<{ id: string; displayName: string }[]>`
    select id, display_name from public.makers where status = 'approved' order by custom_commissions_enabled desc, display_name`;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl">Custom commissions (concierge pilot)</h1>
      <p className="max-w-3xl text-sm text-ink-muted">
        Checkout for commissions is manual in this MVP. When a buyer accepts a quote, create a
        Stripe Payment Link or invoice for the deposit (Stripe Dashboard → Payment Links), email it
        to the buyer from the Emails tab, and record it in the notes below.
      </p>
      <ul className="space-y-4" role="list">
        {rows.map((r) => (
          <li key={r.id} className="card space-y-3 p-4 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium">
                  {r.garmentType}
                  {r.occasion ? ` · ${r.occasion}` : ''}
                </p>
                <p className="text-ink-muted">
                  {r.buyerEmail} → {r.makerName ?? <span className="text-alert">unassigned</span>} ·{' '}
                  {formatPrice(r.budgetMinCents)}–{formatPrice(r.budgetMaxCents)}
                  {r.deadlineDate
                    ? ` · by ${new Date(r.deadlineDate).toLocaleDateString('en-AU')}`
                    : ''}
                </p>
                {r.quoteTotal && (
                  <p className="text-ink-muted">
                    Latest quote: {formatPrice(r.quoteTotal)} (deposit{' '}
                    {formatPrice(r.quoteDeposit ?? 0)}) — {r.quoteStatus}
                  </p>
                )}
                {r.notes && <p className="mt-1 text-ink-soft">“{r.notes}”</p>}
              </div>
              <StatusPill status={r.status} />
            </div>
            <div className="flex flex-wrap gap-3">
              <form action={assignCommissionAction} className="flex gap-1.5">
                <input type="hidden" name="requestId" value={r.id} />
                <select
                  name="makerId"
                  defaultValue={r.makerId ?? ''}
                  aria-label="Assign maker"
                  className="input w-48 py-1 text-xs"
                >
                  <option value="" disabled>
                    Assign maker…
                  </option>
                  {makers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName}
                    </option>
                  ))}
                </select>
                <button className="rounded-full border border-ink px-3 text-xs">Assign</button>
              </form>
              <form action={commissionAdminAction} className="flex flex-wrap gap-1.5">
                <input type="hidden" name="requestId" value={r.id} />
                <select
                  name="status"
                  defaultValue={r.status}
                  aria-label="Status"
                  className="input w-36 py-1 text-xs"
                >
                  {[
                    'submitted',
                    'reviewing',
                    'quoted',
                    'accepted',
                    'declined',
                    'completed',
                    'cancelled',
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <input
                  name="adminNotes"
                  defaultValue={r.adminNotes ?? ''}
                  placeholder="Notes (e.g. payment link sent)"
                  aria-label="Admin notes"
                  className="input w-64 py-1 text-xs"
                />
                <button className="rounded-full bg-ink px-3 text-xs text-paper">Update</button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
