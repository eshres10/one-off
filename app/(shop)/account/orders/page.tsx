import { requireUser } from '@/lib/auth/session';
import { getBuyerOrders } from '@/lib/queries/account';
import { OrderCard } from '@/components/account/OrderCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { ButtonLink } from '@/components/ui/Button';

export const metadata = { title: 'Orders' };

export default async function OrdersPage() {
  const user = await requireUser('/account/orders');
  const orders = await getBuyerOrders(user);
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-[40px] leading-none md:text-[48px]">Orders</h1>
      {orders.length === 0 ? (
        <EmptyState
          title="No orders yet"
          action={<ButtonLink href="/">Start exploring</ButtonLink>}
        >
          Checked out as a guest? Sign in with a magic link sent to the same email and your orders
          will appear here.
        </EmptyState>
      ) : (
        orders.map((o) => <OrderCard key={o.id} order={o} />)
      )}
    </div>
  );
}
