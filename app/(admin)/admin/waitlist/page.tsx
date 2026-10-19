import Link from 'next/link';
import { listWaitlist, waitlistCounts, type WaitlistKind } from '@/lib/services/waitlist';
import { EmptyState } from '@/components/ui/EmptyState';

export const metadata = { title: 'Waitlist' };

type SearchParams = Record<string, string | string[] | undefined>;

const TABS: Array<{ kind?: WaitlistKind; label: string }> = [
  { label: 'All' },
  { kind: 'shopper', label: 'Shoppers' },
  { kind: 'maker', label: 'Makers' },
];

export default async function AdminWaitlistPage({ searchParams }: { searchParams: SearchParams }) {
  const kind =
    searchParams.kind === 'maker' || searchParams.kind === 'shopper'
      ? searchParams.kind
      : undefined;
  const [rows, counts] = await Promise.all([listWaitlist(kind), waitlistCounts()]);
  const count = (k?: WaitlistKind) => (k ? counts[k] : counts.shopper + counts.maker);
  const csvHref = `/admin/waitlist/export${kind ? `?kind=${kind}` : ''}`;
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-[40px] leading-none md:text-[48px]">Waitlist</h1>
        <a href={csvHref} className="text-link">
          Download CSV
        </a>
      </div>
      <p className="mb-6 text-sm text-ink-muted">
        Sign-ups from the{' '}
        <Link href="/waitlist" className="link">
          waitlist page
        </Link>
        . Makers who join here are leads: “Set up a shop” starts their draft shop in the concierge
        pipeline (Shops).
      </p>
      <nav aria-label="Filter" className="mb-6 flex gap-6">
        {TABS.map((t) => (
          <Link
            key={t.label}
            href={t.kind ? `/admin/waitlist?kind=${t.kind}` : '/admin/waitlist'}
            aria-current={t.kind === kind ? 'page' : undefined}
            className={`text-[11px] uppercase tracking-label ${t.kind === kind ? 'underline underline-offset-[6px]' : 'text-ink-muted'}`}
          >
            {t.label} ({count(t.kind)})
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState title="No sign-ups yet">
          Share the waitlist page to start collecting.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="eyebrow">
              <tr className="border-b border-line">
                <th className="py-2 pr-4 font-normal">Email</th>
                <th className="py-2 pr-4 font-normal">Type</th>
                <th className="py-2 pr-4 font-normal">Label</th>
                <th className="py-2 pr-4 font-normal">Instagram</th>
                <th className="py-2 pr-4 font-normal">Source</th>
                <th className="py-2 pr-4 font-normal">Joined</th>
                <th className="py-2 font-normal">
                  <span className="sr-only">Set up</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line">
                  <td className="py-2 pr-4">{r.email}</td>
                  <td className="py-2 pr-4 capitalize">{r.kind}</td>
                  <td className="py-2 pr-4">{r.name ?? '—'}</td>
                  <td className="py-2 pr-4">
                    {r.instagram ? (
                      <a
                        href={`https://instagram.com/${r.instagram}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link"
                      >
                        @{r.instagram}
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-2 pr-4">{r.source ?? '—'}</td>
                  <td className="whitespace-nowrap py-2">
                    {new Date(r.createdAt).toLocaleString('en-AU', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </td>
                  <td className="whitespace-nowrap py-2 pl-4">
                    {r.kind === 'maker' && (
                      <Link
                        className="link"
                        href={`/admin/shops/new?${new URLSearchParams({ name: r.name ?? '', instagram: r.instagram ?? '', email: r.email })}`}
                      >
                        Set up a shop →
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
