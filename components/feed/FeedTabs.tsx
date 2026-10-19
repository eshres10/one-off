import Link from 'next/link';

export { FeedTabs } from './FeedTabsClient';

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
