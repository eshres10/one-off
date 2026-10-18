import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { getBuyerCommissions } from '@/lib/queries/account';
import { decideQuoteAction } from '@/lib/actions/account';
import { formatPrice } from '@/lib/domain/money';
import { StatusPill } from '@/components/ui/Badge';
import { QuoteCard } from '@/components/account/QuoteCard';
import { PilotNotice } from '@/components/forms/PilotNotice';
import { SubmitButton } from '@/components/ui/SubmitButton';

export const metadata = { title: 'Custom request' };

export default async function CommissionDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { submitted?: string };
}) {
  const user = await requireUser(`/account/commissions/${params.id}`);
  if (!z.string().uuid().safeParse(params.id).success) notFound();
  const { requests, quotes } = await getBuyerCommissions(user, params.id);
  const r = requests[0];
  if (!r) notFound();
  const pending = quotes.find((q) => q.status === 'pending');
  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/account/commissions" className="text-sm text-ink-muted hover:underline">
        ← All custom requests
      </Link>
      {searchParams.submitted && (
        <p className="rounded-lg bg-moss-light px-3 py-2 text-sm text-moss" role="status">
          Request sent!{' '}
          {r.makerName
            ? `${r.makerName} has been notified by email.`
            : 'Our team will match you with a maker.'}
        </p>
      )}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl">{r.garmentType}</h1>
          <p className="text-sm text-ink-muted">
            {r.makerName ? `With ${r.makerName}` : 'Awaiting maker match'} · submitted{' '}
            {new Date(r.createdAt).toLocaleDateString('en-AU', { dateStyle: 'medium' })}
          </p>
        </div>
        <StatusPill status={r.status} />
      </div>
      <PilotNotice />
      <dl className="card grid gap-3 p-5 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-ink-muted">Occasion</dt>
          <dd>{r.occasion ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Budget</dt>
          <dd>
            {formatPrice(r.budgetMinCents)}–{formatPrice(r.budgetMaxCents)}
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Needed by</dt>
          <dd>
            {r.deadlineDate
              ? new Date(r.deadlineDate).toLocaleDateString('en-AU', { dateStyle: 'medium' })
              : 'Flexible'}
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Fabric</dt>
          <dd>{r.fabricPreferences ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Colour</dt>
          <dd>{r.colourPreferences ?? '—'}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-ink-muted">Measurements / fit</dt>
          <dd className="whitespace-pre-line">{r.measurements ?? '—'}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-ink-muted">Notes</dt>
          <dd className="whitespace-pre-line">{r.notes ?? '—'}</dd>
        </div>
        {r.inspirationImageUrls.length > 0 && (
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            {r.inspirationImageUrls.map((u) => (
              <img
                key={u}
                src={u}
                alt="Inspiration"
                className="h-20 w-20 rounded-lg object-cover"
              />
            ))}
          </div>
        )}
      </dl>
      {quotes.map((q) => (
        <QuoteCard key={q.id} quote={q}>
          {pending?.id === q.id && (
            <div className="mt-4 flex flex-wrap gap-2">
              <form action={decideQuoteAction}>
                <input type="hidden" name="requestId" value={r.id} />
                <input type="hidden" name="decision" value="accepted" />
                <SubmitButton size="sm" pendingLabel="Accepting…">
                  Accept quote
                </SubmitButton>
              </form>
              <form action={decideQuoteAction}>
                <input type="hidden" name="requestId" value={r.id} />
                <input type="hidden" name="decision" value="declined" />
                <SubmitButton size="sm" variant="secondary" pendingLabel="Declining…">
                  Decline
                </SubmitButton>
              </form>
            </div>
          )}
          {q.status === 'accepted' && (
            <p className="mt-3 text-sm text-moss">
              Accepted — our concierge team will email you a secure Stripe payment link for the
              deposit.
            </p>
          )}
        </QuoteCard>
      ))}
    </div>
  );
}
