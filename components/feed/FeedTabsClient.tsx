'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import type { FeedTab } from '@/lib/queries/catalog';
import { MagneticTabs } from '@/components/home/MagneticTabs';

const TABS: Array<{ id: FeedTab; label: string }> = [
  { id: 'for-you', label: 'For you' },
  { id: 'new', label: 'New this week' },
  { id: 'following', label: 'Following' },
  { id: 'collections', label: 'Collections' },
];

const hrefFor = (id: FeedTab) => (id === 'for-you' ? '/' : `/?tab=${id}`);

/** The homepage feed tabs (magnetic hover); each tab is still its own shareable URL. */
export function FeedTabs({ active }: { active: FeedTab }) {
  const router = useRouter();
  useEffect(() => {
    for (const t of TABS) router.prefetch(hrefFor(t.id));
  }, [router]);
  return (
    <MagneticTabs
      label="Feed"
      tabs={TABS}
      active={active}
      onSelect={(id) => router.push(hrefFor(id as FeedTab), { scroll: false })}
    />
  );
}
