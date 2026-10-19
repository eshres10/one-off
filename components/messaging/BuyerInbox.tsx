import Link from 'next/link';
import type { SessionUser } from '@/lib/auth/session';
import { env } from '@/lib/env';
import { checkoutEnabled } from '@/lib/features';
import {
  getLatestQuote,
  getPieceInfo,
  inboxCounts,
  listThreads,
  type ThreadDetail,
} from '@/lib/services/messaging';
import { BuyerPanel } from './BuyerPanel';
import { BUYER_CHIPS, Conversation } from './Conversation';
import { InboxList, InboxTabs } from './InboxList';
import { EmptyState } from '@/components/states/EmptyState';
import { BubbleIcon } from '@/components/states/illustrations';
import { ThreadTop } from './ThreadTop';

export interface InboxParams {
  tab?: string;
  unread?: string;
}

function qs(p: { tab?: string; unread?: boolean }) {
  const s = new URLSearchParams();
  if (p.tab === 'requests') s.set('tab', 'requests');
  if (p.unread) s.set('unread', '1');
  const q = s.toString();
  return q ? `?${q}` : '';
}

/** Buyer inbox: list | thread | context on desktop; list → full-screen thread on phones. */
export async function BuyerInbox({
  user,
  params,
  thread,
}: {
  user: SessionUser;
  params: InboxParams;
  thread: ThreadDetail | null;
}) {
  const tab = params.tab === 'requests' ? 'requests' : 'chats';
  const unreadOnly = params.unread === '1';
  const [threads, counts, piece, quote] = await Promise.all([
    listThreads(user, 'buyer', {
      kind: tab === 'requests' ? 'custom_request' : 'enquiry',
      unreadOnly,
    }),
    inboxCounts(user, 'buyer'),
    thread?.productId ? getPieceInfo(thread.productId) : Promise.resolve(null),
    thread?.commissionRequestId
      ? getLatestQuote(thread.commissionRequestId)
      : Promise.resolve(null),
  ]);
  const checkoutOn = await checkoutEnabled();
  const listQs = qs({ tab, unread: unreadOnly });

  return (
    <div className="md:grid md:h-[calc(100dvh-var(--header-h))] md:grid-cols-[380px_minmax(0,1fr)_340px] md:grid-rows-[minmax(0,1fr)] md:border-t md:border-line">
      <aside
        className={`${thread ? 'hidden md:flex' : 'flex'} min-h-0 flex-col md:border-r md:border-line`}
        aria-label="Conversations"
      >
        <div className="flex items-end justify-between px-4 pb-4 pt-6 md:pt-8">
          <h1 className="text-[40px] leading-none md:text-[48px]">Messages</h1>
          <Link
            href={`/messages${qs({ tab, unread: !unreadOnly })}`}
            aria-current={unreadOnly ? 'true' : undefined}
            className={`flex min-h-[44px] items-center border px-3 text-[11px] uppercase tracking-label ${unreadOnly ? 'border-ink bg-ink text-ground' : 'border-line-strong'}`}
          >
            <span className="md:hidden">Filter</span>
            <span className="hidden md:inline">Filter by unread</span>
          </Link>
        </div>
        <InboxTabs
          tabs={[
            {
              href: `/messages${qs({ unread: unreadOnly })}`,
              label: `Chats (${counts.chats})`,
              active: tab === 'chats',
            },
            {
              href: `/messages${qs({ tab: 'requests', unread: unreadOnly })}`,
              label: `Custom requests (${counts.requests})`,
              active: tab === 'requests',
            },
          ]}
        />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <InboxList
            threads={threads}
            base="/messages"
            activeId={thread?.id}
            viewer="buyer"
            empty={
              !unreadOnly && tab === 'chats' && counts.chats === 0 ? (
                <EmptyState
                  testId="messages-empty"
                  icon={<BubbleIcon size={72} />}
                  title="No messages, yet."
                  body="Ask a maker anything before you buy: fit, fabric, timing. They usually reply within hours."
                  actions={[{ label: 'Find a maker', href: '/makers' }]}
                >
                  <div
                    className="flex flex-wrap justify-center gap-2"
                    aria-label="Things people ask"
                  >
                    {['Does this run small?', 'Is it lined?', 'Can I get it in black?'].map((c) => (
                      <span
                        key={c}
                        className="inline-flex min-h-[36px] items-center border border-line-strong px-3 text-[13px]"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </EmptyState>
              ) : undefined
            }
            emptyText={
              unreadOnly
                ? 'You’re all caught up.'
                : tab === 'requests'
                  ? 'Custom requests you send to makers will appear here.'
                  : 'Use “Ask the maker” on any piece to ask about fit, fabric or timing.'
            }
          />
        </div>
      </aside>

      {thread ? (
        <section
          className="fixed inset-0 z-[55] flex flex-col bg-ground md:static md:z-auto md:min-h-0"
          aria-label={`Conversation with ${thread.makerName}`}
        >
          <Conversation
            key={thread.id}
            threadId={thread.id}
            currentUserId={user.id}
            viewer="buyer"
            initial={thread.messages}
            otherName={thread.makerName}
            chips={thread.kind === 'enquiry' && thread.productId ? BUYER_CHIPS : []}
            quoteStatus={
              quote?.depositPaidAt
                ? 'Deposit paid'
                : quote?.quoteStatus === 'accepted'
                  ? 'Accepted'
                  : 'Awaiting buyer'
            }
            blocked={thread.buyerBlocked ? 'This maker isn’t accepting messages from you.' : null}
            realtime={env().AUTH_DRIVER === 'supabase'}
            header={
              <ThreadTop
                thread={thread}
                viewer="buyer"
                backHref={`/messages${listQs}`}
                title={thread.makerName}
                subtitle={`${thread.makerRating.toFixed(1)} · Usually replies within ${thread.makerResponseHours} h`}
                piece={piece}
                quote={quote}
                checkoutOn={checkoutOn}
              />
            }
          />
        </section>
      ) : (
        <section className="hidden items-center justify-center p-10 text-center md:flex">
          <div>
            <p className="font-display text-[32px] leading-tight">Choose a conversation</p>
            <p className="mt-2 text-[13px] text-muted">
              Every conversation is about one piece, so the details are always to hand.
            </p>
          </div>
        </section>
      )}

      <aside className="hidden min-h-0 md:block md:border-l md:border-line" aria-label="Details">
        {thread && (
          <BuyerPanel thread={thread} piece={piece} quote={quote} checkoutOn={checkoutOn} />
        )}
      </aside>
    </div>
  );
}
