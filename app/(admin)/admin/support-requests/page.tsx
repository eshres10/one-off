import { requireAdmin } from '@/lib/auth/session';
import { SUPPORT_TOPICS, listSupportRequests } from '@/lib/services/support-requests';

export const metadata = { title: 'Help requests' };

const when = (d: Date) =>
  new Date(d).toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Australia/Melbourne',
  });

/** "Message us" requests from Help & FAQ. Each one was also emailed to the support address. */
export default async function SupportRequestsPage() {
  await requireAdmin();
  const rows = await listSupportRequests();
  return (
    <div className="space-y-6">
      <h1 className="text-[40px] leading-none md:text-[48px]">Help requests</h1>
      <p className="text-[13px] text-muted">
        Sent from Help &amp; FAQ. Each was emailed to the support inbox: reply from there.
      </p>
      {rows.length === 0 ? (
        <p className="text-[14px] text-muted">Nothing yet.</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line" role="list">
          {rows.map((r) => (
            <li key={r.id} className="py-4 text-[13px]">
              <p className="text-[14px]">
                {r.name} ·{' '}
                <a href={`mailto:${r.email}`} className="underline underline-offset-[3px]">
                  {r.email}
                </a>
              </p>
              <p className="text-muted">
                {SUPPORT_TOPICS.find((t) => t.value === r.topic)?.label ?? r.topic}
                {r.orderNumber ? ` · ${r.orderNumber}` : ''} · {when(r.createdAt)}
              </p>
              <p className="mt-2 whitespace-pre-line">{r.message}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
