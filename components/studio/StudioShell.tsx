import Link from 'next/link';
import type { ReactNode } from 'react';
import type { StudioShop } from '@/lib/queries/studio';
import { Img as Image } from '@/components/ui/Img';
import { Wordmark } from '@/components/ui/Wordmark';
import { StudioNav, StudioTabs, type StudioCounts } from './StudioNav';
import { ToastHost } from './ToastHost';

function Avatar({ shop, size }: { shop: StudioShop; size: number }) {
  return (
    <span
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-circle bg-ground/15 text-[11px] uppercase"
      style={{ width: size, height: size }}
    >
      {shop.avatarUrl ? (
        <Image src={shop.avatarUrl} alt="" fill sizes={`${size}px`} className="object-cover" />
      ) : (
        shop.displayName.slice(0, 2)
      )}
    </span>
  );
}

/**
 * Studio chrome: an always-black glass bar (never transparent) with the wordmark, "Studio", the
 * section nav and the shop; on phones, the same bar plus a five-tab bottom bar.
 */
export function StudioShell({
  shop,
  counts,
  children,
}: {
  shop: StudioShop;
  counts: StudioCounts;
  children: ReactNode;
}) {
  return (
    <div
      className="min-h-screen bg-ground pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-0"
      data-studio
    >
      <header
        className="glass-dark sticky top-0 z-40 border-x-0 border-t-0 text-ground"
        data-testid="studio-bar"
      >
        <div className="container-page flex h-[60px] items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <Link href="/studio" aria-label="Studio home" className="flex items-center">
              <Wordmark size="footer" />
            </Link>
            <span className="text-[10px] uppercase tracking-[0.24em] text-ground/70">Studio</span>
          </div>
          <StudioNav counts={counts} />
          <div className="flex items-center gap-5">
            <a
              href={`/makers/${shop.slug}`}
              target="_blank"
              rel="noreferrer"
              className="hidden min-h-[44px] items-center text-[11px] uppercase tracking-label text-ground/75 hover:text-ground lg:flex"
            >
              View shop ↗
            </a>
            <Link
              href="/studio/settings"
              className="flex min-h-[44px] items-center gap-2.5 text-[12px]"
              aria-label={`${shop.displayName} settings`}
            >
              <Avatar shop={shop} size={32} />
              <span className="hidden md:inline">{shop.displayName}</span>
            </Link>
          </div>
        </div>
      </header>
      {shop.shopStatus === 'holiday' && (
        <p className="bg-stone px-4 py-2 text-center text-[12px]" role="status">
          Holiday mode is on. Buyers see “Away”{' '}
          <Link href="/studio/settings#holiday" className="link">
            Turn it off
          </Link>
        </p>
      )}
      {shop.shopStatus === 'closed' && (
        <p className="bg-stone px-4 py-2 text-center text-[12px] text-alert" role="status">
          Your shop is closed and hidden. Open orders still need shipping.{' '}
          <Link href="/studio/settings#account" className="link">
            Reopen
          </Link>
        </p>
      )}
      <main id="main" className="container-page py-6 md:py-10">
        {children}
      </main>
      <StudioTabs counts={counts} />
      <ToastHost />
    </div>
  );
}
