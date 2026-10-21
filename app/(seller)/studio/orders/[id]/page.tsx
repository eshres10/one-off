import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireSeller } from '@/lib/auth/session';
import { getStudioOrder } from '@/lib/services/studio-orders';
import { DesktopRedirect } from '@/components/app/DesktopRedirect';
import { PhoneOrderDetail } from '@/components/app/studio/OrderDetail';

export const metadata = { title: 'Order · Studio' };

/** One order on a phone; a desktop browser opens it in the Orders side panel instead. */
export default async function StudioOrderPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { photo?: string };
}) {
  const seller = await requireSeller();
  if (!z.string().uuid().safeParse(params.id).success) notFound();
  const order = await getStudioOrder(seller, params.id);
  if (!order) notFound();
  return (
    <>
      <DesktopRedirect to={`/studio/orders?tab=all&order=${order.id}`} />
      <div className="md:hidden">
        <PhoneOrderDetail order={order} openPhoto={searchParams.photo === '1'} />
      </div>
    </>
  );
}
