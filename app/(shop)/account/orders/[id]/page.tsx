import { notFound } from 'next/navigation';
import Link from 'next/link';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { getBuyerOrders } from '@/lib/queries/account';
import { OrderCard } from '@/components/account/OrderCard';

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
      <p className="text-sm text-ink-muted">
        Questions about a piece? Message the maker from the product page. Something wrong with your
        order? Our buyer protection has you covered —{' '}
        <Link href="/help/buyer-protection" className="link">
          get help
        </Link>
        .
      </p>
    </div>
  );
}
