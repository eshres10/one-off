import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { DECLINE_REASONS, applicationDetail, foundingSpots } from '@/lib/services/applications';
import { TERMS } from '@/lib/studio/terms';
import { ApplicationActions, InternalNote } from '@/components/admin/ApplicationActions';
import { ApplicationSummary } from '@/components/sell/ApplicationSummary';

export const metadata = { title: 'Application' };

const STATUS: Record<string, string> = {
  draft: 'Not sent yet',
  applied: 'Waiting for review',
  changes_requested: 'Changes requested',
  approved: 'Approved · setting up',
  live: 'Live',
  holiday: 'Live · on holiday',
  declined: 'Declined',
  closed: 'Closed',
};
const DONE: Record<string, string> = {
  approved: 'Approved. The maker has been emailed.',
  changes: 'Sent. The maker can edit and resubmit.',
  declined: 'Declined. The maker has been emailed.',
};
const when = (d: Date | string) =>
  new Date(d).toLocaleString('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Australia/Melbourne',
  });

export default async function ApplicationPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { done?: string };
}) {
  if (!z.string().uuid().safeParse(params.id).success) notFound();
  const [app, spots] = await Promise.all([applicationDetail(params.id), foundingSpots()]);
  if (!app) notFound();
  const a = app.answers;
  return (
    <div className="max-w-[1100px]">
      <Link href="/admin/applications" className="text-[12px] underline underline-offset-4">
        ← Applications
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p
            className="text-[11px] uppercase tracking-label text-muted-2"
            data-testid="application-status"
          >
            {STATUS[app.shopStatus] ?? app.shopStatus}
            {app.appliedAt ? ` · submitted ${when(app.appliedAt)}` : ''}
          </p>
          <h1 className="mt-1 text-[40px] leading-none md:text-[48px]">{a.name || 'Untitled'}</h1>
          <p className="mt-2 text-[14px] text-muted">
            {[a.ownerName, [a.suburb, a.state].filter(Boolean).join(', ')]
              .filter(Boolean)
              .join(' · ')}
            {a.instagram && (
              <>
                {' · '}
                <a
                  href={`https://instagram.com/${a.instagram}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link"
                >
                  @{a.instagram}
                </a>
              </>
            )}
          </p>
        </div>
        {app.foundingNumber && (
          <p className="text-[12px] uppercase tracking-label">
            Founding maker Nº {String(app.foundingNumber).padStart(2, '0')}
          </p>
        )}
      </div>
      {searchParams.done && DONE[searchParams.done] && (
        <p className="mt-4 bg-stone px-4 py-3 text-[13px]" role="status" data-testid="decided">
          {DONE[searchParams.done]}
        </p>
      )}
      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <ApplicationSummary answers={a} large />
        </div>
        <aside className="space-y-6">
          {app.shopStatus === 'applied' ? (
            <ApplicationActions
              makerId={app.makerId}
              label={a.name}
              spotsLeft={spots.left}
              reasons={DECLINE_REASONS}
              foundingMonths={TERMS.foundingMonths}
              reapplyDays={TERMS.reapplyAfterDays}
            />
          ) : (
            app.reviewNote && (
              <div className="bg-stone p-4 text-[13px]">
                <p className="text-[11px] uppercase tracking-label text-muted-2">
                  Note the maker sees
                </p>
                <p className="mt-1 whitespace-pre-line">{app.reviewNote}</p>
                {app.canReapplyAfter && (
                  <p className="mt-2 text-muted">
                    Can reapply after{' '}
                    {new Date(app.canReapplyAfter).toLocaleDateString('en-AU', {
                      dateStyle: 'medium',
                    })}
                  </p>
                )}
              </div>
            )
          )}
          <InternalNote makerId={app.makerId} note={app.internalNote} />
          {app.history.length > 0 && (
            <section>
              <h2 className="label">History</h2>
              <ol className="divide-y divide-line border-y border-line text-[13px]" role="list">
                {app.history.map((h) => (
                  <li key={h.id} className="py-2.5">
                    <p>Submitted {when(h.submittedAt)}</p>
                    {h.decision && (
                      <p className="text-muted">
                        {h.decision.replace('_', ' ')} {h.decidedAt ? when(h.decidedAt) : ''}
                        {h.decisionNote ? ` · ${h.decisionNote}` : ''}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}
          {['approved', 'live', 'holiday'].includes(app.shopStatus) && (
            <Link href={`/admin/shops/${app.makerId}`} className="link text-[13px]">
              Open the shop
            </Link>
          )}
        </aside>
      </div>
    </div>
  );
}
