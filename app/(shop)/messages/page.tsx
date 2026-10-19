import { requireUser } from '@/lib/auth/session';
import { BuyerInbox, type InboxParams } from '@/components/messaging/BuyerInbox';

export const metadata = { title: 'Messages' };

export default async function MessagesPage({ searchParams }: { searchParams: InboxParams }) {
  const user = await requireUser('/messages');
  return <BuyerInbox user={user} params={searchParams} thread={null} />;
}
