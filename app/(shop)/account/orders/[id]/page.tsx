import { notFound } from 'next/navigation';
import Link from 'next/link';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { getBuyerOrders } from '@/lib/queries/account';
import { OrderCard } from '@/components/account/OrderCard';
import { AgreedSpec } from '@/components/commissions/AgreedSpec';
import { RETURNS } from '@/lib/content/returns';

export const metadata = { title: 'Order' };

export default async function OrderPage({ params }: { params: { id: string } }) {
  const user = await requireUser(`/account/orders/${params.id}`);
  if (!z.string().uuid().safeParse(params.id).success) notFound();
  const [order] = await getBuyerOrders(user, params.id);
  if (!order) notFound();
  return (
    <div className="max-w-3xl space-y-4">
      <Link href="/account/orders" className="text-sm text-ink-muted hover:underline">
        ← All orders
      </Link>
      <OrderCard order={order} detailed />
      {order.agreedSpec && <AgreedSpec spec={order.agreedSpec} />}
      <p className="text-sm text-ink-muted">
        Questions about a piece? Message the maker from the product page. Something wrong? Use
        “Report a problem” on the piece within {RETURNS.reportWindowDays} days of delivery —{' '}
        <Link href="/returns" className="link">
          returns &amp; faults
        </Link>
        .
      </p>
    </div>
  );
}
