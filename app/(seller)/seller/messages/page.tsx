import { requireSeller } from '@/lib/auth/session';
import { SellerInbox } from '@/components/messaging/SellerInbox';

export const metadata = { title: 'Messages' };

export default async function SellerMessagesPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const seller = await requireSeller();
  return <SellerInbox seller={seller} tab={searchParams.tab} thread={null} />;
}
