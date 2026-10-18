import { requireUser } from '@/lib/auth/session';
import { listThreads } from '@/lib/services/messaging';
import { ThreadList } from '@/components/messaging/ThreadList';
import { EmptyState } from '@/components/ui/EmptyState';

export const metadata = { title: 'Messages' };

export default async function MessagesPage() {
  const user = await requireUser('/account/messages');
  const threads = await listThreads(user, 'buyer');
  return (
    <div className="max-w-3xl">
      <h1 className="mb-8 text-[40px] leading-none md:text-[48px]">Messages</h1>
      {threads.length ? (
        <ThreadList threads={threads} base="/account/messages" />
      ) : (
        <EmptyState title="No conversations yet">
          Use “Ask the maker” on any piece to ask about fit, fabric or timing.
        </EmptyState>
      )}
    </div>
  );
}
