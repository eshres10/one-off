import { requireAdmin } from '@/lib/auth/session';
import { escalateOverdueClaims, listClaims } from '@/lib/services/claims';
import { ClaimList } from '@/components/claims/ClaimList';

export const metadata = { title: 'Claims' };

export default async function AdminClaimsPage() {
  const admin = await requireAdmin();
  await escalateOverdueClaims();
  const claims = await listClaims(admin, 'admin');
  const escalated = claims.filter((c) => c.status === 'escalated');
  const waiting = claims.filter((c) => c.status === 'open' || c.status === 'seller_responded');
  const closed = claims.filter((c) => !escalated.includes(c) && !waiting.includes(c));
  return (
    <div className="space-y-8">
      <h1 className="text-[40px] leading-none md:text-[48px]">Claims</h1>
      <section aria-labelledby="escalated">
        <h2 id="escalated" className="mb-3 text-[11px] uppercase tracking-label text-error">
          Escalated — needs One Off ({escalated.length})
        </h2>
        <ClaimList
          claims={escalated}
          hrefBase="/admin/claims"
          showMaker
          empty="Nothing escalated."
        />
      </section>
      <section aria-labelledby="waiting">
        <h2 id="waiting" className="mb-3 text-[11px] uppercase tracking-label">
          With makers ({waiting.length})
        </h2>
        <ClaimList claims={waiting} hrefBase="/admin/claims" showMaker empty="No open claims." />
      </section>
      <section aria-labelledby="closed">
        <h2 id="closed" className="mb-3 text-[11px] uppercase tracking-label">
          Resolved ({closed.length})
        </h2>
        <ClaimList claims={closed} hrefBase="/admin/claims" showMaker empty="None yet." />
      </section>
    </div>
  );
}
