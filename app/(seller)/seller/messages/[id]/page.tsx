import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireSeller } from '@/lib/auth/session';
import { getThread } from '@/lib/services/messaging';
import { getReplyTemplates } from '@/lib/queries/seller';
import { ContextCard } from '@/components/messaging/ContextCard';
import { ThreadView } from '@/components/messaging/ThreadView';
import { ThreadHeader } from '@/components/messaging/ThreadHeader';

export const metadata = { title: 'Conversation' };

export default async function SellerThreadPage({ params }: { params: { id: string } }) {
  const seller = await requireSeller();
  if (!z.string().uuid().safeParse(params.id).success) notFound();
  const [thread, templates] = await Promise.all([
    getThread(seller, params.id),
    getReplyTemplates(seller),
  ]);
  if (!thread || thread.makerId !== seller.makerId) notFound();
  return (
    <div className="mx-auto max-w-2xl">
      <ThreadHeader backHref="/seller/messages" name={thread.buyerName} />
      <p className="eyebrow mb-2 mt-4">Asking about</p>
      <ContextCard context={thread.context} makerName={thread.makerName} />
      <div className="mt-4">
        <ThreadView
          threadId={thread.id}
          currentUserId={seller.id}
          initial={thread.messages}
          otherName={thread.buyerName}
          templates={templates}
        />
      </div>
    </div>
  );
}
