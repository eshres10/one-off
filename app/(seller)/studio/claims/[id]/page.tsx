import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSeller } from '@/lib/auth/session';
import { isCustomType } from '@/lib/content/returns';
import { isClaimActive } from '@/lib/domain/claims';
import { getClaim } from '@/lib/services/claims';
import { ClaimDetail } from '@/components/claims/ClaimDetail';
import { ResolveForm, RespondForm } from '@/components/claims/ClaimActions';

export const metadata = { title: 'Problem' };

export default async function SellerClaimPage({ params }: { params: { id: string } }) {
  const seller = await requireSeller();
  const claim = await getClaim(seller, params.id);
  if (!claim || claim.sellerId !== seller.makerId) notFound();
  const active = isClaimActive(claim.status);
  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/studio/claims" className="text-sm text-muted hover:underline">
        ← Problems
      </Link>
      <h1 className="text-[40px] leading-none md:text-[48px]">{claim.caseNumber ?? 'Problem'}</h1>
      <ClaimDetail claim={claim} viewer="seller" />
      {active && (
        <div className="grid gap-8 border-t border-line pt-6">
          <RespondForm claimId={claim.id} custom={isCustomType(claim.productType)} />
          <div className="border-t border-line pt-6">
            <ResolveForm
              claimId={claim.id}
              remainingCents={claim.lineTotalCents - claim.refundedCents}
              admin={false}
            />
          </div>
        </div>
      )}
    </div>
  );
}
