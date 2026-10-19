import Link from 'next/link';
import { CLAIM_REASONS } from '@/lib/content/returns';
import type { ClaimView } from '@/lib/services/claims';
import { ClaimCountdown, ClaimStatusPill } from './ClaimDetail';

/** Claims, most urgent first: escalated, then open by deadline. */
export function ClaimList({
  claims,
  hrefBase,
  showMaker = false,
  empty,
}: {
  claims: ClaimView[];
  hrefBase: string;
  showMaker?: boolean;
  empty: string;
}) {
  if (claims.length === 0) return <p className="text-[14px] text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line border-y border-line" data-testid="claim-list">
      {claims.map((c) => (
        <li key={c.id}>
          <Link
            href={`${hrefBase}/${c.id}`}
            className={`flex flex-wrap items-center justify-between gap-3 px-1 py-4 hover:bg-stone-light/40 ${
              c.status === 'escalated' ? 'border-l-2 border-error pl-3' : ''
            }`}
          >
            <div className="min-w-0">
              <p className="text-[14px]">
                {c.productTitle}{' '}
                <span className="text-muted">
                  · {CLAIM_REASONS.find((r) => r.value === c.reason)?.label}
                </span>
              </p>
              <p className="text-[12px] text-muted-2">
                {c.caseNumber ? `${c.caseNumber} · ` : ''}Order {c.orderNumber}
                {c.pausedPayout ? ' · payout paused' : ''}
                {showMaker ? ` · ${c.makerName}` : ''} ·{' '}
                {c.createdAt.toLocaleDateString('en-AU', { dateStyle: 'medium' })}
              </p>
              <ClaimCountdown claim={c} />
            </div>
            <ClaimStatusPill status={c.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
