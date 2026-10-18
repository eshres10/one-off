import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/session';
import { isClaimActive } from '@/lib/domain/claims';
import { getClaim } from '@/lib/services/claims';
import { ClaimDetail } from '@/components/claims/ClaimDetail';
import { ResolveForm } from '@/components/claims/ClaimActions';

export const metadata = { title: 'Claim' };

export default async function AdminClaimPage({ params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  const claim = await getClaim(admin, params.id);
  if (!claim) notFound();
  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/admin/claims" className="text-sm text-muted hover:underline">
        ← All claims
      </Link>
      <h1 className="text-[40px] leading-none md:text-[48px]">Claim · {claim.makerName}</h1>
      <ClaimDetail claim={claim} viewer="admin" />
      {isClaimActive(claim.status) && (
        <div className="border-t border-line pt-6">
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
