import type { SessionUser } from '@/lib/auth/session';
import { env } from '@/lib/env';
import { checkoutEnabled } from '@/lib/features';
import { getReplyTemplates } from '@/lib/queries/seller';
import {
  getBuyerInfo,
  getMessageStats,
  getPieceInfo,
  inboxCounts,
  listThreads,
  type ThreadDetail,
} from '@/lib/services/messaging';
import { Conversation } from './Conversation';
import { InboxList, InboxTabs } from './InboxList';
import { SellerPanel } from './SellerPanel';
import { ThreadActions } from './ThreadActions';
import { ThreadTop } from './ThreadTop';

type Seller = SessionUser & { makerId: string };

/** Starter replies every maker gets; their own saved replies follow. */
function defaultReplies(leadTimeDays: number | null) {
  return [
    {
      title: 'Size guide',
      body: 'Happy to help with sizing! If you share your bust, waist and hip measurements, I’ll tell you which size will fit best.',
    },
    {
      title: 'Lead time',
      body: `Made-to-order pieces take about ${leadTimeDays ?? 14} days to make, then 2–6 business days for delivery.`,
    },
    {
      title: 'Fabric & care',
      body: 'The fabric and care details are on the listing. Let me know if you’d like a swatch photo in daylight.',
    },
    { title: 'Thank you', body: 'Thank you so much — I hope you love it!' },
  ];
}

function qs(tab: string) {
  return tab === 'all' ? '' : `?tab=${tab}`;
}

export async function SellerInbox({
  seller,
  tab: rawTab,
  thread,
}: {
  seller: Seller;
  tab?: string;
  thread: ThreadDetail | null;
}) {
  const tab = rawTab === 'needs-reply' || rawTab === 'requests' ? rawTab : 'all';
  const checkoutOn = await checkoutEnabled();
  const [threads, counts, stats, templates, piece, buyer] = await Promise.all([
    listThreads(seller, 'maker', {
      kind: tab === 'requests' ? 'custom_request' : undefined,
      needsReply: tab === 'needs-reply',
    }),
    inboxCounts(seller, 'maker'),
    getMessageStats(seller),
    getReplyTemplates(seller),
    thread?.productId ? getPieceInfo(thread.productId) : Promise.resolve(null),
    thread ? getBuyerInfo(seller, thread.id) : Promise.resolve(null),
  ]);
  const replies = [
    ...defaultReplies(piece?.leadTimeDays ?? null).filter(
      (d) => !templates.some((t) => t.title.toLowerCase() === d.title.toLowerCase()),
    ),
    ...templates.map((t) => ({ title: t.title, body: t.body })),
  ];
  const badgeHours = stats.replyHours <= 6 ? 6 : stats.replyHours;

  return (
    <div className="-mx-[var(--gutter)] -my-10">
      <dl
        className={`${thread ? 'hidden md:grid' : 'grid'} grid-cols-3 border-b border-line bg-surface`}
        data-testid="studio-stats"
      >
        <div className="border-r border-line px-4 py-3 md:px-6">
          <dt className="text-[10px] uppercase tracking-label text-muted-2">Average reply</dt>
          <dd className="font-display text-[26px] leading-tight">{stats.replyHours} h</dd>
        </div>
        <div className="border-r border-line px-4 py-3 md:px-6">
          <dt className="text-[10px] uppercase tracking-label text-muted-2">
            Enquiry → sale (30d)
          </dt>
          <dd className="font-display text-[26px] leading-tight">{stats.conversionPct}%</dd>
        </div>
        <div className="px-4 py-3 md:px-6">
          <dt className="text-[10px] uppercase tracking-label text-muted-2">Shop badge</dt>
          <dd className="mt-1 inline-block bg-ink px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-ground">
            Replies within {badgeHours} hrs
          </dd>
        </div>
      </dl>
      <div className="md:grid md:h-[calc(100dvh-105px-69px)] md:grid-cols-[360px_minmax(0,1fr)_320px] md:grid-rows-[minmax(0,1fr)]">
        <aside
          className={`${thread ? 'hidden md:flex' : 'flex'} min-h-0 flex-col md:border-r md:border-line`}
          aria-label="Conversations"
        >
          <h1 className="px-4 pb-3 pt-5 text-[34px] leading-none">Messages</h1>
          <InboxTabs
            tabs={[
              { href: `/studio/messages${qs('all')}`, label: 'All', active: tab === 'all' },
              {
                href: `/studio/messages${qs('needs-reply')}`,
                label: `Needs reply (${counts.needsReply})`,
                active: tab === 'needs-reply',
              },
              {
                href: `/studio/messages${qs('requests')}`,
                label: `Requests (${counts.requests})`,
                active: tab === 'requests',
              },
            ]}
          />
          <div className="min-h-0 flex-1 overflow-y-auto pb-20 md:pb-0">
            <InboxList
              threads={threads}
              base="/studio/messages"
              activeId={thread?.id}
              viewer="maker"
              emptyText={
                tab === 'needs-reply'
                  ? 'You’re all caught up.'
                  : 'Questions from shoppers about your pieces will appear here.'
              }
            />
          </div>
        </aside>

        {thread ? (
          <section
            className="fixed inset-0 z-[55] flex flex-col bg-ground md:static md:z-auto md:min-h-0"
            aria-label={`Conversation with ${thread.buyerName}`}
          >
            <Conversation
              key={thread.id}
              threadId={thread.id}
              currentUserId={seller.id}
              viewer="maker"
              initial={thread.messages}
              otherName={thread.buyerName}
              savedReplies={replies}
              realtime={env().AUTH_DRIVER === 'supabase'}
              header={
                <ThreadTop
                  thread={thread}
                  viewer="maker"
                  backHref={`/studio/messages${qs(tab)}`}
                  title={thread.buyerName}
                  subtitle={
                    thread.context.productTitle ??
                    thread.context.commissionGarment ??
                    'General question'
                  }
                  piece={piece}
                  checkoutOn={checkoutOn}
                  actions={
                    <ThreadActions
                      threadId={thread.id}
                      needsReply={thread.needsReply}
                      blocked={thread.buyerBlocked}
                    />
                  }
                />
              }
            />
          </section>
        ) : (
          <section className="hidden items-center justify-center p-10 text-center md:flex">
            <p className="font-display text-[30px] leading-tight">Choose a conversation</p>
          </section>
        )}

        <aside className="hidden min-h-0 md:block md:border-l md:border-line" aria-label="Details">
          {thread && <SellerPanel thread={thread} buyer={buyer} piece={piece} />}
        </aside>
      </div>
    </div>
  );
}
