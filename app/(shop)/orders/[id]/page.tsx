import { redirect } from 'next/navigation';

/** Short link used in emails. */
export default function OrderShortLink({ params }: { params: { id: string } }) {
  redirect(`/account/orders/${params.id}`);
}
