import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/session';
import { isClaimActive } from '@/lib/domain/claims';
import { getClaim, listCaseNotes } from '@/lib/services/claims';
import { CaseNotes } from '@/components/claims/CaseNotes';
import { SITE } from '@/lib/site/config';
import { ClaimDetail } from '@/components/claims/ClaimDetail';
import { ResolveForm } from '@/components/claims/ClaimActions';

export const metadata = { title: 'Case' };

export default async function AdminClaimPage({ params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  const claim = await getClaim(admin, params.id);
  if (!claim) notFound();
  const notes = await listCaseNotes(admin, claim.id);
  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/admin/claims" className="text-sm text-muted hover:underline">
        ← All claims
      </Link>
      <h1 className="text-[40px] leading-none md:text-[48px]">
        {claim.caseNumber ?? 'Case'} · {claim.makerName}
      </h1>
      <ClaimDetail claim={claim} viewer="admin" />
      <CaseNotes claimId={claim.id} notes={notes} />
      {isClaimActive(claim.status) && (
        <div className="border-t border-line pt-6">
          {claim.pausedPayout && (
            <p className="mb-4 text-[13px] text-muted">
              Reported within {SITE.cases.pausePayoutIfReportedWithinDays} days of delivery, so the
              maker’s payout is paused until you resolve this. A refund after the maker was paid
              reverses their transfer, or comes off their next payouts.
            </p>
          )}
          <ResolveForm
            claimId={claim.id}
            remainingCents={claim.lineTotalCents - claim.refundedCents}
            admin
          />
        </div>
      )}
    </div>
  );
}
