import { redirect } from 'next/navigation';
import { sql } from '@/lib/db';

/** Old hosted-Checkout return address: forwards to the order's confirmation. */
export default async function LegacySuccess({
  searchParams,
}: {
  searchParams: { session_id?: string };
}) {
  const [o] = searchParams.session_id
    ? await sql()<{ orderNumber: string }[]>`
        select order_number from public.orders where stripe_checkout_session_id = ${searchParams.session_id}`
    : [];
  redirect(o ? `/checkout/confirmed/${o.orderNumber}` : '/account/orders');
}
