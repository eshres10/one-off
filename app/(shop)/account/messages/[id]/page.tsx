import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { getThread } from '@/lib/services/messaging';
import { ContextCard } from '@/components/messaging/ContextCard';
import { ThreadView } from '@/components/messaging/ThreadView';
import { responseTimeLabel } from '@/components/maker/MakerByline';

export const metadata = { title: 'Conversation' };

export default async function ThreadPage({ params }: { params: { id: string } }) {
  const user = await requireUser(`/account/messages/${params.id}`);
  if (!z.string().uuid().safeParse(params.id).success) notFound();
  const thread = await getThread(user, params.id);
  if (!thread || thread.buyerUserId !== user.id) notFound();
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="max-w-2xl">
        <Link href="/account/messages" className="text-sm text-ink-muted hover:underline">
          ← All messages
        </Link>
        <h1 className="mt-2 text-2xl">{thread.makerName}</h1>
        <p className="mb-6 text-sm text-ink-muted">
          {responseTimeLabel(thread.makerResponseHours)}
        </p>
        <ThreadView
          threadId={thread.id}
          currentUserId={user.id}
          initial={thread.messages}
          otherName={thread.makerName}
          presets={Boolean(thread.productId)}
        />
      </div>
      <aside className="order-first lg:order-none">
        <ContextCard context={thread.context} makerName={thread.makerName} />
      </aside>
    </div>
  );
}
