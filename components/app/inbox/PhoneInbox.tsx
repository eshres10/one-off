'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ThreadSummary } from '@/lib/services/messaging';
import type { BuyerNotification } from '@/lib/queries/notifications';
import { Img as Image } from '@/components/ui/Img';
import { Segmented } from '../ui';

const ago = (d: Date | string, now = Date.now()) => {
  const ms = now - new Date(d).getTime();
  const m = Math.round(ms / 60_000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days}d`;
  return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
};

function Avatar({ name, url }: { name: string; url: string | null }) {
  return (
    <span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-circle bg-stone text-[13px] uppercase">
      {url ? (
        <Image src={url} alt="" fill sizes="48px" className="object-cover" />
      ) : (
        name.slice(0, 1)
      )}
    </span>
  );
}

/** Inbox: a Messages / Notifications control, then conversation rows or the notification list. */
export function PhoneInbox({
  tab,
  threads,
  notifications,
}: {
  tab: 'messages' | 'notifications';
  threads: ThreadSummary[];
  notifications: BuyerNotification[];
}) {
  const router = useRouter();
  const unread = threads.reduce((n, t) => n + (t.unreadCount > 0 ? 1 : 0), 0);
  return (
    <div className="pb-6" data-testid="phone-inbox">
      <div className="px-4 pt-3">
        <Segmented
          value={tab}
          onChange={(v) => router.replace(v === 'messages' ? '/inbox' : '/inbox?tab=notifications')}
          label="Inbox"
          testId="inbox-tabs"
          options={[
            { value: 'messages', label: 'Messages', count: unread },
            { value: 'notifications', label: 'Notifications' },
          ]}
        />
      </div>
      {tab === 'messages' ? (
        threads.length ? (
          <ul className="mt-2 divide-y divide-line" role="list" data-testid="inbox-list">
            {threads.map((t) => {
              const piece = t.context.productTitle ?? t.context.commissionGarment ?? null;
              const thumb = t.context.imageUrl ?? null;
              const isUnread = t.unreadCount > 0;
              return (
                <li key={t.id}>
                  <Link
                    href={`/messages/${t.id}`}
                    className="flex items-center gap-3 px-4 py-3.5"
                    data-testid="inbox-row"
                  >
                    <Avatar name={t.counterpartName} url={t.counterpartAvatar} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={`truncate text-[15px] ${isUnread ? 'font-medium' : ''}`}>
                          {t.counterpartName}
                        </span>
                        <span className="shrink-0 text-[11px] text-muted-2">
                          {ago(t.lastMessageAt)}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-2">
                        {isUnread && (
                          <span
                            aria-label="Unread"
                            className="h-2 w-2 shrink-0 rounded-circle bg-[#8A2E1C]"
                          />
                        )}
                        <span
                          className={`truncate text-[13px] ${isUnread ? 'text-ink' : 'text-muted'}`}
                        >
                          {t.lastFromMe ? 'You: ' : ''}
                          {t.lastBody ?? (piece ? `About ${piece}` : '')}
                        </span>
                      </span>
                    </span>
                    {thumb && (
                      <span className="relative h-12 w-10 shrink-0 overflow-hidden rounded-[6px] bg-stone">
                        <Image
                          src={thumb}
                          alt=""
                          fill
                          sizes="40px"
                          className="object-cover object-top"
                        />
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="px-6 py-16 text-center" data-testid="inbox-empty">
            <p className="font-display text-[26px]">No messages, yet.</p>
            <p className="mt-2 text-[13px] text-muted">
              Ask a maker anything before you buy: fit, fabric, timing. They usually reply within
              hours.
            </p>
            <Link
              href="/makers"
              className="mt-5 inline-flex min-h-[48px] items-center rounded-pill border border-ink px-6 text-[12px] uppercase tracking-[0.16em]"
            >
              Find a maker
            </Link>
          </div>
        )
      ) : notifications.length ? (
        <ul className="mt-2 divide-y divide-line" role="list" data-testid="notification-list">
          {notifications.map((n) => (
            <li key={n.id}>
              <Link href={n.href} className="flex items-center gap-3 px-4 py-3.5">
                <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-circle bg-stone">
                  {n.imageUrl && (
                    <Image
                      src={n.imageUrl}
                      alt=""
                      fill
                      sizes="48px"
                      className="object-cover object-top"
                    />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[15px]">{n.title}</span>
                    <span className="shrink-0 text-[11px] text-muted-2">{ago(n.at)}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[13px] text-muted">{n.body}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="px-6 py-16 text-center" data-testid="notifications-empty">
          <p className="font-display text-[26px]">Nothing yet.</p>
          <p className="mt-2 text-[13px] text-muted">
            Order updates and quotes from makers land here.
          </p>
        </div>
      )}
    </div>
  );
}
