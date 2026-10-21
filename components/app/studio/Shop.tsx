'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { saveCustomSettingsAction } from '@/lib/actions/custom-studio';
import { formatPrice } from '@/lib/domain/money';
import type { ListingCard } from '@/lib/services/studio-listings';
import type { CustomSettings } from '@/lib/services/custom-studio';
import { Img as Image } from '@/components/ui/Img';
import { ExternalIcon } from '@/components/ui/icons';
import { Switch } from '@/components/studio/Switch';
import { Segmented } from '../ui';
import { toast } from '../Toast';

type Tab = 'live' | 'drafts' | 'sold';

/** Shop (phones): cover, avatar, stats, the custom work switch, and Live / Drafts / Sold. */
export function StudioShop({
  shop,
  pieces,
  settings,
  tab,
}: {
  shop: {
    slug: string;
    displayName: string;
    avatarUrl: string | null;
    coverUrl: string | null;
    suburb: string | null;
  };
  pieces: ListingCard[];
  settings: CustomSettings;
  tab: Tab;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(settings.open);
  const [, start] = useTransition();
  const live = pieces.filter((p) => p.status === 'approved');
  const drafts = pieces.filter((p) => p.status === 'draft' || p.status === 'pending');
  const sold = pieces.filter((p) => p.sold > 0);
  const list = tab === 'live' ? live : tab === 'drafts' ? drafts : sold;
  const left = Math.max(0, settings.spotsPerMonth - settings.spotsUsed);
  const totalSold = pieces.reduce((s, p) => s + p.sold, 0);
  const totalSaves = pieces.reduce((s, p) => s + p.saves, 0);

  const toggle = (next: boolean) => {
    setOpen(next);
    start(async () => {
      const res = await saveCustomSettingsAction({
        open: next,
        spotsPerMonth: settings.spotsPerMonth,
        categories: settings.categories,
        fabrics: settings.fabrics,
        minPrice: settings.minPrice,
        leadTime: settings.leadTime,
        fittingsInPerson: settings.fittingsInPerson,
        fittingRadiusKm: settings.fittingRadiusKm,
        postsAustraliaWide: settings.postsAustraliaWide,
        studioPostcode: settings.studioPostcode,
      });
      if (!res.ok) {
        setOpen(!next);
        toast(res.message);
      } else toast(next ? 'Open for custom work' : 'Custom work off');
    });
  };

  return (
    <div className="pb-6" data-testid="studio-shop">
      <div className="relative -mx-4 h-[140px] bg-stone">
        {shop.coverUrl && (
          <Image src={shop.coverUrl} alt="" fill sizes="100vw" className="object-cover" />
        )}
      </div>
      <div className="-mt-8 flex items-end gap-3">
        <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-circle border-2 border-ground bg-surface">
          {shop.avatarUrl && (
            <Image src={shop.avatarUrl} alt="" fill sizes="64px" className="object-cover" />
          )}
        </span>
        <div className="min-w-0 flex-1 pb-1">
          <p className="truncate font-display text-[24px] leading-none">{shop.displayName}</p>
          {shop.suburb && <p className="text-[12px] text-muted">{shop.suburb}</p>}
        </div>
        <a
          href={`/makers/${shop.slug}`}
          target="_blank"
          rel="noreferrer"
          className="mb-1 flex min-h-[36px] items-center gap-1 rounded-pill border border-ink px-3 text-[11px] uppercase tracking-[0.12em]"
          data-testid="view-as-buyer"
        >
          View as buyer <ExternalIcon width={12} height={12} />
        </a>
      </div>
      <dl className="mt-4 grid grid-cols-3 text-center">
        {[
          ['Live', live.length],
          ['Sold', totalSold],
          ['Likes', totalSaves],
        ].map(([l, n]) => (
          <div key={l}>
            <dd className="font-display text-[24px] leading-none">{n}</dd>
            <dt className="mt-1 text-[11px] uppercase tracking-label text-muted-2">{l}</dt>
          </div>
        ))}
      </dl>
      <div
        className="mt-4 flex items-center justify-between rounded-app bg-surface px-4 py-2"
        data-testid="custom-work-row"
      >
        <span>
          <span id="custom-work-label" className="block text-[14px]">
            Custom work
          </span>
          <span className="block text-[12px] text-muted">
            {open
              ? `${left} of ${settings.spotsPerMonth} spots left this month`
              : 'Not taking requests'}
          </span>
        </span>
        <Switch
          checked={open}
          onChange={toggle}
          labelledBy="custom-work-label"
          testId="custom-work-switch"
        />
      </div>
      <div className="mt-4">
        <Segmented
          value={tab}
          onChange={(v) => router.replace(v === 'live' ? '/studio/shop' : `/studio/shop?tab=${v}`)}
          label="Pieces"
          testId="shop-tabs"
          options={[
            { value: 'live', label: 'Live' },
            { value: 'drafts', label: 'Drafts', count: drafts.length },
            { value: 'sold', label: 'Sold' },
          ]}
        />
      </div>
      {list.length ? (
        <ul className="-mx-4 mt-3 grid grid-cols-3 gap-[2px]" role="list" data-testid="shop-grid">
          {list.map((p) => (
            <li key={p.id} className="relative">
              <Link href={`/studio/listings/${p.id}`} className="block" aria-label={p.title}>
                <span className="relative block aspect-4/5 bg-stone">
                  {p.imageUrl && (
                    <Image
                      src={p.imageUrl}
                      alt=""
                      fill
                      sizes="33vw"
                      className="object-cover object-top"
                    />
                  )}
                  <span
                    className={`absolute left-1.5 top-1.5 rounded-pill px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] ${p.status === 'approved' ? 'bg-ground/90 text-ink' : 'bg-ink text-ground'}`}
                  >
                    {p.status === 'approved'
                      ? 'Live'
                      : p.status === 'archived'
                        ? 'Hidden'
                        : 'Draft'}
                  </span>
                </span>
                <span className="flex items-baseline justify-between px-1.5 py-1.5 text-[12px]">
                  <span>{formatPrice(p.priceCents)}</span>
                  <span className="text-muted-2">♡ {p.saves}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-10 text-center text-[13px] text-muted">
          {tab === 'live'
            ? 'No live pieces yet. Tap + to list one.'
            : tab === 'drafts'
              ? 'No drafts.'
              : 'Nothing sold yet.'}
        </p>
      )}
    </div>
  );
}
