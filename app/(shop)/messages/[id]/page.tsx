import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { getThread } from '@/lib/services/messaging';
import { BuyerInbox, type InboxParams } from '@/components/messaging/BuyerInbox';

export const metadata = { title: 'Conversation' };

export default async function ThreadPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: InboxParams;
}) {
  const user = await requireUser(`/messages/${params.id}`);
  if (!z.string().uuid().safeParse(params.id).success) notFound();
  const thread = await getThread(user, params.id);
  if (!thread || thread.buyerUserId !== user.id) notFound();
  return <BuyerInbox user={user} params={searchParams} thread={thread} />;
}
