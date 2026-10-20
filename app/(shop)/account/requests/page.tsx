import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { fmtDay } from '@/lib/custom/brief';
import { listBuyerRequests } from '@/lib/services/custom';

export const metadata = { title: 'Custom requests' };

const STATUS: Record<string, string> = {
  sent: 'Waiting for quotes',
  quoted: 'Quotes in',
  accepted: 'In the making',
  expired: 'No replies',
  cancelled: 'Cancelled',
  help_requested: 'With the Off One team',
};

/** The buyer's "Have it made" requests. */
export default async function RequestsPage() {
  const user = await requireUser('/account/requests');
  const rows = await listBuyerRequests(user);
  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-[44px] leading-none">Custom requests</h1>
      {rows.length === 0 ? (
        <div className="mt-6 flex flex-col items-start gap-4 border-t border-line pt-6">
          <p className="text-[14px] text-muted">
            Nothing yet. Tell us what you’re dreaming of and we’ll match you with makers who can
            make it.
          </p>
          <Link
            href="/have-it-made"
            className="glass-dark inline-flex min-h-[48px] items-center px-6 text-[11px] uppercase tracking-[0.18em] text-ground"
            data-testid="start-brief"
          >
            Have it made
          </Link>
        </div>
      ) : (
        <ul
          className="mt-6 divide-y divide-line border-y border-line"
          role="list"
          data-testid="requests-list"
        >
          {rows.map((r) => (
            <li key={r.number}>
              <Link
                href={`/account/requests/${r.number}`}
                className="flex items-center justify-between gap-4 py-4 hover:bg-surface"
              >
                <span className="flex flex-col">
                  <span className="text-[15px]">{r.title}</span>
                  <span className="text-[12px] text-muted">
                    {r.number} · {r.neededBy ? `by ${fmtDay(r.neededBy)}` : 'flexible'} · asked{' '}
                    {r.asked}
                    {r.quoted ? ` · ${r.quoted} quote${r.quoted === 1 ? '' : 's'}` : ''}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] uppercase tracking-[0.16em] text-muted">
                  {STATUS[r.status] ?? r.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {rows.length > 0 && (
        <Link
          href="/have-it-made"
          className="mt-6 inline-block text-[13px] underline underline-offset-[3px]"
        >
          Start another brief
        </Link>
      )}
    </div>
  );
}
