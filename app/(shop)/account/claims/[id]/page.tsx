import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { RETURNS } from '@/lib/content/returns';
import { getClaim } from '@/lib/services/claims';
import { ClaimDetail } from '@/components/claims/ClaimDetail';

export const metadata = { title: 'Your report' };

export default async function BuyerClaimPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { sent?: string };
}) {
  const user = await requireUser(`/account/claims/${params.id}`);
  const claim = await getClaim(user, params.id);
  if (!claim) notFound();
  return (
    <div className="max-w-2xl space-y-6">
      <Link
        href={`/account/orders/${claim.orderId}`}
        className="text-sm text-muted hover:underline"
      >
        ← Order {claim.orderNumber}
      </Link>
      <h1 className="text-[40px] leading-none md:text-[48px]">Your report</h1>
      {searchParams.sent && (
        <p
          className="bg-stone-light px-3 py-2.5 text-[13px]"
          role="status"
          data-testid="claim-sent"
        >
          Thanks — we’ve sent your report to {claim.makerName}. They’ll reply within 2 business
          days, and we’ll email you when they do.
        </p>
      )}
      <ClaimDetail claim={claim} viewer="buyer" />
      <p className="text-[12px] text-muted-2">{RETURNS.aclNote}</p>
    </div>
  );
}
