import Link from 'next/link';
import type { FeedTab } from '@/lib/queries/catalog';

const TABS: Array<{ id: FeedTab; label: string }> = [
  { id: 'for-you', label: 'For you' },
  { id: 'new', label: 'New this week' },
  { id: 'following', label: 'Following' },
  { id: 'collections', label: 'Collections' },
];

/** Serif feed tabs; links, so each tab is shareable. */
export function FeedTabs({ active }: { active: FeedTab }) {
  return (
    <nav aria-label="Feed">
      <ul className="no-scrollbar bleed flex gap-6 overflow-x-auto md:justify-center md:gap-10">
        {TABS.map((t) => {
          const isActive = t.id === active;
          return (
            <li key={t.id} className="shrink-0">
              <Link
                aria-current={isActive ? 'page' : undefined}
                href={t.id === 'for-you' ? '/' : `/?tab=${t.id}`}
                scroll={false}
                className={`inline-block font-display text-[22px] leading-[1.6] md:text-[30px] ${
                  isActive
                    ? 'text-ink underline decoration-1 underline-offset-[8px]'
                    : 'text-muted-2 hover:text-ink'
                }`}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function CollectionChips({
  collections,
  activeSlug,
}: {
  collections: Array<{ slug: string; title: string }>;
  activeSlug?: string;
}) {
  return (
    <div className="no-scrollbar bleed flex items-center gap-2 overflow-x-auto md:justify-center">
      <span className="eyebrow mr-2 hidden shrink-0 md:inline">Collections</span>
      {collections.map((c) => (
        <Link
          key={c.slug}
          href={`/collections/${c.slug}`}
          className={`inline-flex min-h-[44px] shrink-0 items-center px-4 text-[11px] uppercase tracking-label ${
            c.slug === activeSlug ? 'glass-dark' : 'border border-line-strong hover:border-ink'
          }`}
        >
          {c.title}
        </Link>
      ))}
    </div>
  );
}
