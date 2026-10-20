import Link from 'next/link';
import { getPipeline } from '@/lib/services/concierge';
import { foundingSpots } from '@/lib/services/applications';

export const metadata = { title: 'Shops pipeline' };

const STAGES = [
  'draft',
  'invited',
  'opened',
  'agreement signed',
  'Stripe connected',
  'live',
] as const;

export default async function AdminShopsPage() {
  const [rows, spots] = await Promise.all([getPipeline(), foundingSpots()]);
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-[40px] leading-none md:text-[48px]">Shops</h1>
        <Link
          href="/admin/shops/new"
          className="glass-dark flex min-h-[44px] items-center px-5 text-[11px] uppercase tracking-[0.18em] text-ground"
          data-testid="new-shop"
        >
          Create shop
        </Link>
      </div>
      <p className="mb-6 text-sm text-ink-muted">
        Shops Off One sets up for makers, from draft to live. Invited shops are pre-approved and
        never enter the{' '}
        <Link href="/admin/applications" className="link">
          applications
        </Link>{' '}
        queue. Founding spots used: {spots.used} of {spots.total}. Makers from the{' '}
        <Link href="/admin/waitlist?kind=maker" className="link">
          waitlist
        </Link>{' '}
        can be set up from there.
      </p>
      <ol
        className="mb-6 flex flex-wrap gap-2 text-[11px] uppercase tracking-label"
        aria-label="Pipeline stages"
      >
        {STAGES.map((s) => (
          <li key={s} className="border border-line px-2 py-1">
            {s} · {rows.filter((r) => r.stage === s).length}
          </li>
        ))}
      </ol>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm" data-testid="pipeline">
          <thead className="eyebrow">
            <tr className="border-b border-line">
              <th className="py-2 pr-4 font-normal">Shop</th>
              <th className="py-2 pr-4 font-normal">Source</th>
              <th className="py-2 pr-4 font-normal">Nº</th>
              <th className="py-2 pr-4 font-normal">Stage</th>
              <th className="py-2 pr-4 font-normal">Claim step</th>
              <th className="py-2 pr-4 font-normal">Pieces</th>
              <th className="py-2 pr-4 font-normal">Last activity</th>
              <th className="py-2 font-normal">Contact</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line" data-testid="pipeline-row">
                <td className="py-2 pr-4">
                  <Link href={`/admin/shops/${r.id}`} className="link">
                    {r.displayName}
                  </Link>
                </td>
                <td className="py-2 pr-4">Invite</td>
                <td className="py-2 pr-4">
                  {r.foundingNumber ? String(r.foundingNumber).padStart(2, '0') : '—'}
                </td>
                <td className="py-2 pr-4" data-testid="pipeline-stage">
                  {r.stage}
                </td>
                <td className="py-2 pr-4">{r.stage === 'live' ? '—' : `${r.claimStep}/5`}</td>
                <td className="py-2 pr-4">{r.pieces}</td>
                <td className="whitespace-nowrap py-2 pr-4">
                  {new Date(r.lastActivity).toLocaleString('en-AU', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                    timeZone: 'Australia/Melbourne',
                  })}
                  {r.lastEvent && (
                    <span className="block text-[11px] text-ink-muted">
                      {r.lastEvent.replace(/_/g, ' ')}
                    </span>
                  )}
                </td>
                <td className="py-2">
                  {r.instagram && (
                    <a
                      className="link mr-2"
                      href={`https://instagram.com/${r.instagram}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      @{r.instagram}
                    </a>
                  )}
                  {r.email}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
