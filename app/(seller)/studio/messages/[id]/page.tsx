import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireSeller } from '@/lib/auth/session';
import { getThread } from '@/lib/services/messaging';
import { SellerInbox } from '@/components/messaging/SellerInbox';

export const metadata = { title: 'Conversation' };

export default async function SellerThreadPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  const seller = await requireSeller();
  if (!z.string().uuid().safeParse(params.id).success) notFound();
  const thread = await getThread(seller, params.id);
  if (!thread || thread.makerId !== seller.makerId) notFound();
  return <SellerInbox seller={seller} tab={searchParams.tab} thread={thread} />;
}
