import { redirect } from 'next/navigation';

export default function AccountThreadPage({ params }: { params: { id: string } }) {
  redirect(`/messages/${params.id}`);
}
