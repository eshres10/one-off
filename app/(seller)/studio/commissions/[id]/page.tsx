import Link from 'next/link';
import { AgreedSpec } from '@/components/commissions/AgreedSpec';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireSeller } from '@/lib/auth/session';
import { getSellerCommissions } from '@/lib/queries/seller';
import { commissionResponseAction } from '@/lib/actions/seller';
import { formatPrice } from '@/lib/domain/money';
import type { QuoteView } from '@/lib/queries/account';
import { StatusPill } from '@/components/ui/Badge';
import { QuoteCard } from '@/components/account/QuoteCard';
import { QuoteForm } from '@/components/seller/QuoteForm';
import { SubmitButton } from '@/components/ui/SubmitButton';

export const metadata = { title: 'Custom request' };

export default async function SellerCommissionPage({ params }: { params: { id: string } }) {
  const seller = await requireSeller();
  if (!z.string().uuid().safeParse(params.id).success) notFound();
  const { requests, quotes } = await getSellerCommissions(seller, params.id);
  const r = requests[0];
  if (!r) notFound();
  const open = ['submitted', 'reviewing', 'quoted'].includes(r.status);
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
      <div className="space-y-5">
        <Link href="/studio/commissions" className="text-sm text-ink-muted hover:underline">
          ← All requests
        </Link>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-[40px] leading-none md:text-[48px]">{r.garmentType}</h1>
          <StatusPill status={r.status} />
        </div>
        {r.agreedSpec && <AgreedSpec spec={r.agreedSpec} agreedAt={r.agreedAt} />}
        <dl className="card grid gap-3 p-5 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-ink-muted">From</dt>
            <dd>{r.buyerName}</dd>
          </div>
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
            <dt className="text-ink-muted">Deadline</dt>
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
                  alt="Buyer inspiration"
                  className="h-24 w-24 rounded-lg object-cover"
                />
              ))}
            </div>
          )}
        </dl>
        {r.status === 'submitted' && (
          <div className="flex gap-2">
            <form action={commissionResponseAction}>
              <input type="hidden" name="requestId" value={r.id} />
              <input type="hidden" name="decision" value="accept" />
              <SubmitButton size="sm">Accept & review</SubmitButton>
            </form>
            <form action={commissionResponseAction}>
              <input type="hidden" name="requestId" value={r.id} />
              <input type="hidden" name="decision" value="decline" />
              <SubmitButton size="sm" variant="secondary">
                Decline
              </SubmitButton>
            </form>
          </div>
        )}
      </div>
      <div className="space-y-4">
        {(quotes as unknown as QuoteView[]).map((q) => (
          <QuoteCard key={q.id} quote={q} />
        ))}
        {open && <QuoteForm requestId={r.id} />}
      </div>
    </div>
  );
}
