import Link from 'next/link';
import { supportInbox } from '@/lib/services/support';

export const metadata = { title: 'Maker messages · Admin' };

export default async function AdminSupportPage() {
  const rows = await supportInbox();
  return (
    <div className="space-y-6">
      <h1 className="text-[40px] leading-none">Maker messages</h1>
      {rows.length === 0 ? (
        <p className="text-[14px] text-muted">No messages yet.</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line" role="list">
          {rows.map((r) => (
            <li key={r.userId}>
              <Link
                href={`/admin/support/${r.userId}`}
                className="flex min-h-[64px] items-center gap-4 py-3 hover:bg-stone/50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px]">{r.shop ?? r.email}</span>
                  <span className="block truncate text-[12px] text-muted">{r.last}</span>
                </span>
                {r.waiting && (
                  <span className="rounded-circle border border-alert px-2.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-alert">
                    Needs a reply
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
