import Link from 'next/link';
import { sql } from '@/lib/db';

export const metadata = { title: 'Audit log' };

export default async function AuditPage({
  searchParams,
}: {
  searchParams: { action?: string; page?: string };
}) {
  const action = (searchParams.action ?? '').trim().slice(0, 60);
  const page = Math.max(1, Math.min(50, Number(searchParams.page) || 1));
  const rows = await sql()<
    {
      id: string;
      action: string;
      entityType: string;
      entityId: string | null;
      metadata: Record<string, unknown>;
      createdAt: Date;
      actor: string | null;
    }[]
  >`
    select a.id, a.action, a.entity_type, a.entity_id, a.metadata, a.created_at, u.email as actor
    from public.audit_events a left join public.users u on u.id = a.actor_user_id
    ${action ? sql()`where a.action ilike ${action + '%'}` : sql()``}
    order by a.created_at desc limit 100 offset ${(page - 1) * 100}`;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-[40px] leading-none md:text-[48px]">Audit log</h1>
        <form className="flex gap-2">
          <input
            name="action"
            defaultValue={action}
            placeholder="Filter by action, e.g. refund"
            aria-label="Filter by action"
            className="input w-64"
          />
          <button className="min-h-[44px] border border-ink px-4 text-[10px] uppercase tracking-label">
            Filter
          </button>
        </form>
      </div>
      <div className="overflow-x-auto border-t border-ink">
        <table className="w-full min-w-[760px] text-left text-[13px]">
          <thead className="text-[10px] uppercase tracking-label text-muted-2">
            <tr className="border-b border-line">
              <th className="py-3 pr-4 font-normal">When</th>
              <th className="py-3 pr-4 font-normal">Action</th>
              <th className="py-3 pr-4 font-normal">Entity</th>
              <th className="py-3 pr-4 font-normal">Actor</th>
              <th className="py-3 font-normal">Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line align-top">
                <td className="whitespace-nowrap py-2.5 pr-4 text-muted-2">
                  {new Date(r.createdAt).toLocaleString('en-AU', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </td>
                <td className="py-2.5 pr-4 font-mono text-[12px]">{r.action}</td>
                <td className="py-2.5 pr-4">
                  {r.entityType} <span className="text-muted-2">{r.entityId?.slice(0, 8)}</span>
                </td>
                <td className="py-2.5 pr-4">{r.actor ?? 'system'}</td>
                <td className="max-w-[320px] truncate py-2.5 font-mono text-[11px] text-muted-2">
                  {JSON.stringify(r.metadata)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-6">
        {page > 1 && (
          <Link
            href={`/admin/audit?page=${page - 1}${action ? `&action=${action}` : ''}`}
            className="text-link"
          >
            Newer
          </Link>
        )}
        {rows.length === 100 && (
          <Link
            href={`/admin/audit?page=${page + 1}${action ? `&action=${action}` : ''}`}
            className="text-link"
          >
            Older
          </Link>
        )}
      </div>
    </div>
  );
}
