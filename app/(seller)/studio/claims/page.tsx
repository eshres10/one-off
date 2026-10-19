import { requireSeller } from '@/lib/auth/session';
import { escalateOverdueClaims, listClaims } from '@/lib/services/claims';
import { ClaimList } from '@/components/claims/ClaimList';

export const metadata = { title: 'Claims' };

export default async function SellerClaimsPage() {
  const seller = await requireSeller();
  await escalateOverdueClaims();
  const claims = await listClaims(seller, 'seller');
  const active = claims.filter((c) => ['open', 'escalated', 'seller_responded'].includes(c.status));
  const closed = claims.filter((c) => !active.includes(c));
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[40px] leading-none md:text-[48px]">Claims</h1>
        <p className="mt-2 max-w-2xl text-[14px] text-muted">
          Buyers can report a faulty, damaged or not-as-described piece within 7 days of delivery.
          Reply within 2 business days with a repair, replacement or refund — after that, the claim
          goes to One Off.
        </p>
      </div>
      <section aria-labelledby="active-claims">
        <h2 id="active-claims" className="mb-3 text-[11px] uppercase tracking-label">
          Needs attention
        </h2>
        <ClaimList claims={active} hrefBase="/studio/claims" empty="No open claims. Nice work." />
      </section>
      {closed.length > 0 && (
        <section aria-labelledby="closed-claims">
          <h2 id="closed-claims" className="mb-3 text-[11px] uppercase tracking-label">
            Resolved
          </h2>
          <ClaimList claims={closed} hrefBase="/studio/claims" empty="" />
        </section>
      )}
    </div>
  );
}
