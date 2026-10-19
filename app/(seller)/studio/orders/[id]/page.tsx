import { redirect } from 'next/navigation';

/** Old order links open the order panel on the Orders page. */
export default function StudioOrderLink({ params }: { params: { id: string } }) {
  redirect(`/studio/orders?tab=all&order=${encodeURIComponent(params.id)}`);
}
