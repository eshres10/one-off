import Link from 'next/link';
import type { FeedTab } from '@/lib/queries/catalog';

const TABS: Array<{ id: FeedTab; label: string }> = [
  { id: 'for-you', label: 'For you' },
  { id: 'new', label: 'New this week' },
  { id: 'following', label: 'Following' },
  { id: 'collections', label: 'Collections' },
];

export function FeedTabs({ active }: { active: FeedTab }) {
  return (
    <nav
      aria-label="Feed"
      className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0"
    >
      {TABS.map((t) => {
        const isActive = t.id === active;
        return (
          <Link
            key={t.id}
            href={t.id === 'for-you' ? '/' : `/?tab=${t.id}`}
            aria-current={isActive ? 'page' : undefined}
            className={`shrink-0 rounded-full px-4 py-2 text-sm transition ${
              isActive
                ? 'bg-ink text-paper'
                : 'border border-stone bg-white text-ink-soft hover:border-ink hover:text-ink'
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
