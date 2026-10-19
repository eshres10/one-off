import Link from 'next/link';
import { MADE_BY } from '@/lib/services/apply';
import { applicationQueue, foundingSpots, spotChecks } from '@/lib/services/applications';
import { TERMS } from '@/lib/studio/terms';
import { SpotCheckForm } from '@/components/admin/ApplicationActions';
import { Img as Image } from '@/components/ui/Img';

export const metadata = { title: 'Applications' };

const TABS = [
  ['waiting', 'Waiting'],
  ['changes', 'Changes requested'],
  ['spot-checks', 'Spot checks'],
] as const;
const day = (d: Date | string) =>
  new Date(d).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Australia/Melbourne',
  });

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const tab = TABS.some(([k]) => k === searchParams.tab) ? searchParams.tab! : 'waiting';
  const [waiting, changes, checks, spots] = await Promise.all([
    applicationQueue('applied'),
    applicationQueue('changes_requested'),
    spotChecks(),
    foundingSpots(),
  ]);
  const rows = tab === 'changes' ? changes : waiting;
  const counts: Record<string, number> = {
    waiting: waiting.length,
    changes: changes.length,
    'spot-checks': checks.length,
  };
  return (
    <div>
      <h1 className="text-[40px] leading-none md:text-[48px]">Applications</h1>
      <p className="mb-6 mt-2 text-sm text-ink-muted">
        Makers who applied at /sell/apply, oldest first. We aim to decide within{' '}
        {TERMS.reviewBusinessDays} business days. Founding spots used: {spots.used} of {spots.total}
        . Invited shops are in{' '}
        <Link href="/admin/shops" className="link">
          Shops
        </Link>{' '}
        and never come through here.
      </p>
      <nav className="mb-6 flex gap-6 border-b border-line" aria-label="Applications">
        {TABS.map(([k, label]) => (
          <Link
            key={k}
            href={k === 'waiting' ? '/admin/applications' : `/admin/applications?tab=${k}`}
            aria-current={tab === k ? 'page' : undefined}
            className={`-mb-px min-h-[44px] border-b-2 pt-3 text-[11px] uppercase tracking-label ${tab === k ? 'border-ink' : 'border-transparent text-muted'}`}
            data-testid={`tab-${k}`}
          >
            {label} · {counts[k]}
          </Link>
        ))}
      </nav>

      {tab === 'spot-checks' ? (
        checks.length ? (
          <ul
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            role="list"
            data-testid="spot-checks"
          >
            {checks.map((c) => (
              <li key={c.productId} className="flex gap-3 border border-line bg-surface p-3">
                <span className="relative h-[110px] w-[88px] shrink-0 overflow-hidden bg-stone">
                  {c.imageUrl && (
                    <Image src={c.imageUrl} alt="" fill sizes="88px" className="object-cover" />
                  )}
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-[11px] uppercase tracking-label text-muted-2">Spot-check</p>
                  <a
                    href={`/products/${c.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="link block truncate text-[14px]"
                  >
                    {c.title}
                  </a>
                  <p className="text-[12px] text-muted">
                    {c.shop}
                    {c.publishedAt ? ` · ${day(c.publishedAt)}` : ''}
                  </p>
                  <SpotCheckForm productId={c.productId} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-10 text-[14px] text-muted">
            No pieces to spot-check. The first {TERMS.spotCheckPieces} pieces from each newly
            approved shop show up here.
          </p>
        )
      ) : rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm" data-testid="applications-queue">
            <thead className="eyebrow">
              <tr className="border-b border-line">
                <th className="py-2 pr-4 font-normal">Label</th>
                <th className="py-2 pr-4 font-normal">Maker</th>
                <th className="py-2 pr-4 font-normal">Suburb</th>
                <th className="py-2 pr-4 font-normal">Instagram</th>
                <th className="py-2 pr-4 font-normal">Work</th>
                <th className="py-2 pr-4 font-normal">Who makes the pieces</th>
                <th className="py-2 pr-4 font-normal">Submitted</th>
                <th className="py-2 font-normal">Waiting</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.makerId} className="border-b border-line" data-testid="application-row">
                  <td className="py-3 pr-4">
                    <Link href={`/admin/applications/${r.makerId}`} className="link">
                      {r.label || 'Untitled'}
                    </Link>
                    {r.resubmitted && (
                      <span className="ml-2 text-[11px] uppercase tracking-label text-muted-2">
                        Resubmitted
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4">{r.owner}</td>
                  <td className="py-3 pr-4">{r.place}</td>
                  <td className="py-3 pr-4">
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
                  <td className="py-3 pr-4">
                    <Link href={`/admin/applications/${r.makerId}`} className="flex gap-1">
                      {r.photos.slice(0, 4).map((src, i) => (
                        <span
                          key={src}
                          className="relative h-12 w-10 shrink-0 overflow-hidden bg-stone"
                        >
                          <Image
                            src={src}
                            alt={`Work photo ${i + 1}`}
                            fill
                            sizes="40px"
                            className="object-cover"
                          />
                        </span>
                      ))}
                    </Link>
                  </td>
                  <td className="max-w-[260px] py-3 pr-4">
                    {MADE_BY.find((m) => m.value === r.madeBy)?.label ?? '—'}
                    {r.madeByDetail && (
                      <span className="block text-[12px] text-muted">{r.madeByDetail}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap py-3 pr-4">{day(r.submittedAt)}</td>
                  <td
                    className={`whitespace-nowrap py-3 ${r.overdue ? 'text-alert' : ''}`}
                    data-testid="days-waiting"
                  >
                    {r.daysWaiting} {r.daysWaiting === 1 ? 'day' : 'days'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="py-10 text-[14px] text-muted">
          {tab === 'changes' ? 'No one is reworking an application.' : 'No applications waiting.'}
        </p>
      )}
    </div>
  );
}
