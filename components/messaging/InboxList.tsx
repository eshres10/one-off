import Link from 'next/link';
import type { ThreadSummary } from '@/lib/services/messaging';
import { Img as Image } from '@/components/ui/Img';

const when = (d: Date) => {
  const date = new Date(d);
  const today = new Date();
  if (date.toDateString() === today.toDateString())
    return date.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
  if (today.getTime() - date.getTime() < 6 * 86_400_000)
    return date.toLocaleDateString('en-AU', { weekday: 'short' });
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

function dueLabel(due: Date | null) {
  if (!due) return 'Reply';
  const hours = Math.ceil((new Date(due).getTime() - Date.now()) / 3_600_000);
  if (hours <= 0) return 'Reply · overdue';
  return `Reply · ${hours} h left`;
}

export function InboxList({
  threads,
  base,
  activeId,
  viewer,
  emptyText,
}: {
  threads: ThreadSummary[];
  base: '/messages' | '/seller/messages';
  activeId?: string;
  viewer: 'buyer' | 'maker';
  emptyText: string;
}) {
  if (!threads.length)
    return <p className="px-4 py-12 text-center text-[13px] text-muted">{emptyText}</p>;
  return (
    <ul role="list" className="divide-y divide-line" data-testid="inbox-list">
      {threads.map((t) => {
        const unread = t.unreadCount > 0;
        const piece = t.context.productTitle ?? t.context.commissionGarment ?? 'General question';
        return (
          <li key={t.id}>
            <Link
              href={`${base}/${t.id}`}
              aria-current={t.id === activeId ? 'true' : undefined}
              data-testid="inbox-row"
              className={`flex items-start gap-3 px-4 py-4 hover:bg-surface ${t.id === activeId ? 'bg-surface' : ''}`}
            >
              <span className="relative mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-circle bg-stone-light text-[12px]">
                {viewer === 'buyer' && t.counterpartAvatar ? (
                  <Image
                    src={t.counterpartAvatar}
                    alt=""
                    fill
                    sizes="44px"
                    className="object-cover"
                  />
                ) : (
                  initials(t.counterpartName)
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={`truncate text-[14px] ${unread ? 'font-medium' : ''}`}>
                    {t.counterpartName}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-2">{when(t.lastMessageAt)}</span>
                </span>
                <span className="mt-0.5 block truncate text-[11px] uppercase tracking-label text-muted-2">
                  {piece}
                </span>
                <span className="mt-1 flex items-center gap-2">
                  <span
                    className={`line-clamp-1 flex-1 text-[13px] ${unread ? 'font-medium text-ink' : 'text-muted'}`}
                  >
                    {t.lastFromMe ? 'You: ' : ''}
                    {t.lastBody}
                  </span>
                  {unread && (
                    <span aria-label="Unread" className="h-2 w-2 shrink-0 rounded-circle bg-ink" />
                  )}
                </span>
                {viewer === 'maker' && t.needsReply && (
                  <span
                    className="mt-2 inline-block bg-ink px-2 py-[3px] text-[10px] uppercase tracking-[0.12em] text-ground"
                    data-testid="needs-reply-tag"
                  >
                    {dueLabel(t.replyDueAt)}
                  </span>
                )}
              </span>
              {t.context.imageUrl && (
                <span className="relative h-[55px] w-[44px] shrink-0 overflow-hidden bg-stone-light md:h-[65px] md:w-[52px]">
                  <Image
                    src={t.context.imageUrl}
                    alt=""
                    fill
                    sizes="52px"
                    className="object-cover object-top"
                  />
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Tab row shared by both inboxes (links keep state in the URL). */
export function InboxTabs({
  tabs,
}: {
  tabs: Array<{ href: string; label: string; active: boolean }>;
}) {
  return (
    <nav aria-label="Conversations" className="flex gap-6 border-b border-line px-4">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? 'page' : undefined}
          className={`flex min-h-[44px] items-center border-b-2 text-[11px] uppercase tracking-label ${t.active ? 'border-ink' : 'border-transparent text-muted-2'}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
