import Link from 'next/link';
import { Img as Image } from '@/components/ui/Img';
import type { ThreadSummary } from '@/lib/services/messaging';

export function ThreadList({
  threads,
  base,
}: {
  threads: ThreadSummary[];
  base: '/account/messages' | '/seller/messages';
}) {
  return (
    <ul
      className="divide-y divide-stone/70 rounded-2xl border border-stone/70 bg-white"
      role="list"
    >
      {threads.map((t) => (
        <li key={t.id}>
          <Link href={`${base}/${t.id}`} className="flex gap-3 p-4 hover:bg-stone-light/40">
            <span className="relative aspect-4/5 w-12 shrink-0 overflow-hidden rounded-md bg-stone-light">
              {(t.context.imageUrl ?? t.counterpartAvatar) && (
                <Image
                  src={(t.context.imageUrl ?? t.counterpartAvatar)!}
                  alt=""
                  fill
                  sizes="48px"
                  className="object-cover"
                />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className={`truncate text-sm ${t.unread ? 'font-semibold' : 'font-medium'}`}>
                  {t.counterpartName}
                  {t.unread && (
                    <span
                      className="ml-2 inline-block h-2 w-2 rounded-circle bg-ink align-middle"
                      aria-label="Unread"
                    />
                  )}
                </p>
                <time className="shrink-0 text-xs text-ink-muted">
                  {new Date(t.lastMessageAt).toLocaleDateString('en-AU', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </time>
              </div>
              <p className="truncate text-xs text-ink-muted">
                {t.context.productTitle ?? 'General question'}
              </p>
              <p className="truncate text-sm text-ink-soft">{t.lastBody}</p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
