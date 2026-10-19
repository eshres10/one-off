import Link from 'next/link';
import { requireSeller } from '@/lib/auth/session';
import { getSellerCommissions } from '@/lib/queries/seller';
import { formatPrice } from '@/lib/domain/money';
import { StatusPill } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { PilotNotice } from '@/components/forms/PilotNotice';

export const metadata = { title: 'Custom requests' };

export default async function SellerCommissionsPage() {
  const seller = await requireSeller();
  const { requests } = await getSellerCommissions(seller);
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-[40px] leading-none md:text-[48px]">Custom requests</h1>
      <PilotNotice />
      {requests.length === 0 ? (
        <EmptyState title="No requests yet">
          Turn on custom commissions in your profile settings to receive requests.
        </EmptyState>
      ) : (
        <ul
          className="divide-y divide-stone/70 rounded-2xl border border-stone/70 bg-white"
          role="list"
        >
          {requests.map((r) => (
            <li key={r.id}>
              <Link
                href={`/studio/commissions/${r.id}`}
                className="flex items-center justify-between gap-3 p-4 hover:bg-stone-light/40"
              >
                <div>
                  <p className="font-medium">
                    {r.garmentType}
                    {r.occasion ? ` · ${r.occasion}` : ''}
                  </p>
                  <p className="text-sm text-ink-muted">
                    From {r.buyerName} · {formatPrice(r.budgetMinCents)}–
                    {formatPrice(r.budgetMaxCents)}
                  </p>
                </div>
                <StatusPill status={r.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
