import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { getThread } from '@/lib/services/messaging';
import { ContextCard } from '@/components/messaging/ContextCard';
import { ThreadView } from '@/components/messaging/ThreadView';
import { ThreadHeader } from '@/components/messaging/ThreadHeader';

export const metadata = { title: 'Conversation' };

export default async function ThreadPage({ params }: { params: { id: string } }) {
  const user = await requireUser(`/account/messages/${params.id}`);
  if (!z.string().uuid().safeParse(params.id).success) notFound();
  const thread = await getThread(user, params.id);
  if (!thread || thread.buyerUserId !== user.id) notFound();
  return (
    <div className="mx-auto max-w-2xl">
      <ThreadHeader
        backHref="/account/messages"
        name={thread.makerName}
        responseHours={thread.makerResponseHours}
        avatarUrl={thread.makerAvatar}
      />
      <ContextCard context={thread.context} makerName={thread.makerName} />
      <div className="mt-4">
        <ThreadView
          threadId={thread.id}
          currentUserId={user.id}
          initial={thread.messages}
          otherName={thread.makerName}
          presets={Boolean(thread.productId)}
        />
      </div>
    </div>
  );
}
