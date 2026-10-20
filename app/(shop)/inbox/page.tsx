import { requireUser } from '@/lib/auth/session';
import { listThreads } from '@/lib/services/messaging';
import { listBuyerNotifications } from '@/lib/queries/notifications';
import { BuyerInbox } from '@/components/messaging/BuyerInbox';
import { PhoneInbox } from '@/components/app/inbox/PhoneInbox';

export const metadata = { title: 'Inbox' };

/** Inbox: messages and notifications on phones; the desktop sees today's Messages page. */
export default async function InboxPage({ searchParams }: { searchParams: { tab?: string } }) {
  const user = await requireUser('/inbox');
  const [threads, notifications] = await Promise.all([
    listThreads(user, 'buyer'),
    listBuyerNotifications(user),
  ]);
  return (
    <>
      <div className="md:hidden">
        <PhoneInbox
          tab={searchParams.tab === 'notifications' ? 'notifications' : 'messages'}
          threads={threads}
          notifications={notifications}
        />
      </div>
      <div className="max-md:hidden">
        <BuyerInbox user={user} params={{}} thread={null} />
      </div>
    </>
  );
}
