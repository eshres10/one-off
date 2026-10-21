import { requireSeller } from '@/lib/auth/session';
import { listMakerRequests } from '@/lib/services/custom-studio';
import { inboxCounts, listThreads } from '@/lib/services/messaging';
import { DesktopRedirect } from '@/components/app/DesktopRedirect';
import { StudioInbox } from '@/components/app/studio/Inbox';

export const metadata = { title: 'Inbox · Studio' };

/** Studio Inbox (phones): requests and buyer messages. Desktop goes to Messages. */
export default async function StudioInboxPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const seller = await requireSeller();
  const [requests, threads, counts] = await Promise.all([
    listMakerRequests(seller),
    listThreads(seller, 'maker'),
    inboxCounts(seller, 'maker'),
  ]);
  return (
    <>
      <DesktopRedirect
        to={searchParams.tab === 'messages' ? '/studio/messages' : '/studio/requests'}
      />
      <div className="md:hidden">
        <StudioInbox
          tab={searchParams.tab === 'messages' ? 'messages' : 'requests'}
          requests={requests}
          threads={threads}
          needsReply={counts.needsReply}
        />
      </div>
    </>
  );
}
