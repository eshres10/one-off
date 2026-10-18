import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { getBuyerCommissions } from '@/lib/queries/account';
import { formatPrice } from '@/lib/domain/money';
import { StatusPill } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ButtonLink } from '@/components/ui/Button';

export const metadata = { title: 'Custom requests' };

export default async function CommissionsPage() {
  const user = await requireUser('/account/commissions');
  const { requests } = await getBuyerCommissions(user);
  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-end justify-between">
        <h1 className="text-[40px] leading-none md:text-[48px]">Custom requests</h1>
        <Link href="/custom" className="text-sm underline underline-offset-4">
          New request
        </Link>
      </div>
      {requests.length === 0 ? (
        <EmptyState
          title="No custom requests yet"
          action={<ButtonLink href="/custom">Request a custom piece</ButtonLink>}
        >
          Commission something made just for you from an independent maker.
        </EmptyState>
      ) : (
        <ul
          className="divide-y divide-stone/70 rounded-2xl border border-stone/70 bg-white"
          role="list"
        >
          {requests.map((r) => (
            <li key={r.id}>
              <Link
                href={`/account/commissions/${r.id}`}
                className="flex items-center justify-between gap-3 p-4 hover:bg-stone-light/40"
              >
                <div>
                  <p className="font-medium">
                    {r.garmentType}
                    {r.occasion ? ` · ${r.occasion}` : ''}
                  </p>
                  <p className="text-sm text-ink-muted">
                    {r.makerName ?? 'Matching you with a maker'} · {formatPrice(r.budgetMinCents)}–
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
