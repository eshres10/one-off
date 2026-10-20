import { CLAIM_REASONS, REQUESTED_OUTCOMES } from '@/lib/content/returns';
import {
  CLAIM_STATUS_LABEL,
  PROPOSAL_LABEL,
  isOverdue,
  responseCountdown,
  type ClaimStatus,
} from '@/lib/domain/claims';
import { formatPrice } from '@/lib/domain/money';
import type { ClaimView } from '@/lib/services/claims';
import { AgreedSpec, type AgreedSpecData } from '@/components/commissions/AgreedSpec';

/** Times on a case read in the maker's own zone, with the zone named ("3:00 pm AWST"). */
const fmt = (d: Date, timeZone = 'Australia/Melbourne') =>
  d.toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
    timeZoneName: 'short',
  });

export function ClaimStatusPill({ status }: { status: ClaimStatus }) {
  const strong = status === 'escalated' || status === 'open';
  return (
    <span
      className={`inline-flex min-h-[26px] items-center px-2.5 text-[10px] uppercase tracking-label ${
        status === 'escalated'
          ? 'bg-error-bg text-error'
          : strong
            ? 'border border-ink'
            : 'border border-line-strong text-muted'
      }`}
    >
      {CLAIM_STATUS_LABEL[status]}
    </span>
  );
}

/** Time left for the maker, as text (announced by screen readers via role="timer"). */
export function ClaimCountdown({
  claim,
  now = new Date(),
}: {
  claim: Pick<ClaimView, 'status' | 'respondBy' | 'makerTimezone'>;
  now?: Date;
}) {
  if (claim.status !== 'open') return null;
  const overdue = isOverdue(claim, now);
  return (
    <p
      role="timer"
      aria-live="off"
      className={`text-[12px] ${overdue ? 'text-error' : 'text-ink'}`}
      data-testid="claim-countdown"
    >
      {responseCountdown(claim.respondBy, now)} · due {fmt(claim.respondBy, claim.makerTimezone)}
    </p>
  );
}

export function ClaimDetail({
  claim,
  viewer,
}: {
  claim: ClaimView;
  viewer: 'buyer' | 'seller' | 'admin';
}) {
  const reason = CLAIM_REASONS.find((r) => r.value === claim.reason)?.label ?? claim.reason;
  return (
    <div className="space-y-6">
      <section className="border border-line bg-surface p-5" aria-labelledby="claim-report">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="claim-report" className="text-[28px] leading-none">
              {reason}
            </h2>
            <p className="mt-1 text-[12px] text-muted-2">
              {claim.caseNumber ? `${claim.caseNumber} · ` : ''}
              {claim.productTitle} · {claim.variantLabel} · order {claim.orderNumber}
              {viewer !== 'buyer' && claim.buyerName ? ` · from ${claim.buyerName}` : ''} · reported{' '}
              {fmt(claim.createdAt, claim.makerTimezone)}
            </p>
          </div>
          <ClaimStatusPill status={claim.status} />
        </div>
        <p className="mt-4 whitespace-pre-line text-[14px] leading-relaxed">{claim.details}</p>
        {claim.requestedOutcome && (
          <p className="mt-3 text-[13px]" data-testid="requested-outcome">
            Asked for:{' '}
            {REQUESTED_OUTCOMES.find((o) => o.value === claim.requestedOutcome)?.label ??
              claim.requestedOutcome}
          </p>
        )}
        {viewer === 'admin' && (claim.pausedPayout || claim.platformDueAt) && (
          <p className="mt-1 text-[12px] text-muted" data-testid="case-admin-facts">
            {claim.pausedPayout ? 'Maker payout paused for this case. ' : ''}
            {claim.platformDueAt
              ? `Off One decides by ${fmt(claim.platformDueAt, claim.makerTimezone)}.`
              : ''}
          </p>
        )}
        <ul className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6" aria-label="Photos">
          {claim.photos.map((_, i) => (
            <li key={i}>
              <a
                href={`/api/claims/${claim.id}/photos/${i}`}
                target="_blank"
                rel="noreferrer"
                className="block aspect-square overflow-hidden bg-stone-light"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/claims/${claim.id}/photos/${i}`}
                  alt={`Photo ${i + 1} of the problem`}
                  className="h-full w-full object-cover"
                />
              </a>
            </li>
          ))}
        </ul>
      </section>

      {claim.agreedSpec && <AgreedSpec spec={claim.agreedSpec as AgreedSpecData} />}

      <section className="border border-line bg-surface p-5" aria-labelledby="claim-maker">
        <h2 id="claim-maker" className="text-[24px] leading-none">
          {viewer === 'seller' ? 'Your reply' : `${claim.makerName}’s reply`}
        </h2>
        {claim.sellerResponse ? (
          <>
            {claim.proposal && (
              <p className="mt-3 text-[11px] uppercase tracking-label">
                Proposed: {PROPOSAL_LABEL[claim.proposal]}
              </p>
            )}
            <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed">
              {claim.sellerResponse}
            </p>
          </>
        ) : (
          <div className="mt-3 space-y-1 text-[14px] text-muted">
            <p>No reply yet.</p>
            <ClaimCountdown claim={claim} />
          </div>
        )}
        {claim.status === 'escalated' && (
          <p className="mt-3 bg-error-bg px-3 py-2 text-[13px] text-error">
            {viewer === 'buyer'
              ? 'Off One has stepped in and will be in touch.'
              : 'Escalated to Off One: the maker didn’t reply within 2 business days.'}
          </p>
        )}
      </section>

      {claim.resolvedAt && (
        <section className="border border-ink bg-surface p-5" aria-labelledby="claim-outcome">
          <h2 id="claim-outcome" className="text-[24px] leading-none">
            Outcome
          </h2>
          <p className="mt-3 text-[14px]">
            {CLAIM_STATUS_LABEL[claim.status]}
            {claim.refundCents ? ` · ${formatPrice(claim.refundCents)} refunded` : ''} ·{' '}
            {fmt(claim.resolvedAt, claim.makerTimezone)}
          </p>
          {claim.resolutionNote && (
            <p className="mt-2 whitespace-pre-line text-[14px] text-text2">
              {claim.resolutionNote}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
