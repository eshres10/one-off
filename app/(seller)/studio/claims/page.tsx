import Link from 'next/link';
import { requireSeller } from '@/lib/auth/session';
import { escalateOverdueClaims, listClaims } from '@/lib/services/claims';
import { ClaimList } from '@/components/claims/ClaimList';

export const metadata = { title: 'Problems' };

export default async function SellerClaimsPage() {
  const seller = await requireSeller();
  await escalateOverdueClaims();
  const claims = await listClaims(seller, 'seller');
  const active = claims.filter((c) => ['open', 'escalated', 'seller_responded'].includes(c.status));
  const closed = claims.filter((c) => !active.includes(c));
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[40px] leading-none md:text-[56px]">Orders</h1>
        <nav
          aria-label="Order status"
          className="no-scrollbar -mx-4 mt-6 flex gap-6 overflow-x-auto border-b border-line px-4 md:mx-0 md:px-0"
        >
          <Link
            href="/studio/orders"
            className="-mb-px flex min-h-[44px] shrink-0 items-center border-b border-transparent text-[11px] uppercase tracking-label text-muted-2 hover:text-ink"
          >
            ‹ All orders
          </Link>
          <span
            aria-current="page"
            className="-mb-px flex min-h-[44px] shrink-0 items-center gap-1.5 border-b border-ink text-[11px] uppercase tracking-label"
          >
            Problems <span className="text-muted-2">({active.length})</span>
          </span>
        </nav>
        <h2 className="mt-8 font-display text-[32px] leading-none">Problems</h2>
        <p className="mt-2 max-w-2xl text-[14px] text-muted">
          Buyers can report a faulty or not-as-described piece within 7 days of delivery. Reply
          within 2 business days with a repair, replacement or refund. Your reply goes into your
          messages with the buyer. After that, One Off steps in.
        </p>
      </div>
      <section aria-labelledby="active-claims">
        <h2 id="active-claims" className="mb-3 text-[11px] uppercase tracking-label">
          Needs attention
        </h2>
        <ClaimList claims={active} hrefBase="/studio/claims" empty="No open problems. Nice work." />
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
