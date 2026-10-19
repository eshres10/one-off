import Link from 'next/link';
import type { ReactNode } from 'react';
import { logoutAction } from '@/lib/actions/auth';
import { Wordmark } from '@/components/ui/Wordmark';
import { StudioTabBar } from './StudioTabBar';

type NavLink = { href: string; label: string; count?: number };

/**
 * Seller/admin chrome: a black glass top bar with the wordmark and section label, then the
 * section nav. `secondary` links sit after a divider; `mobileTabs` adds a phone tab bar.
 */
export function DashboardShell({
  title,
  links,
  secondary = [],
  badge,
  right,
  mobileTabs,
  children,
}: {
  title: string;
  links: NavLink[];
  secondary?: NavLink[];
  badge?: ReactNode;
  right?: ReactNode;
  mobileTabs?: NavLink[];
  children: ReactNode;
}) {
  const link = (l: NavLink) => (
    <Link
      key={l.href}
      href={l.href}
      className="flex min-h-[44px] shrink-0 items-center gap-1.5 text-[11px] uppercase tracking-label hover:underline hover:underline-offset-[6px]"
    >
      {l.label}
      {l.count ? (
        <span className="bg-ground px-1.5 text-[10px] text-ink" aria-label={`${l.count} waiting`}>
          {l.count}
        </span>
      ) : null}
    </Link>
  );
  return (
    <div className="min-h-screen bg-ground" data-dashboard>
      <header className="glass-dark sticky top-0 z-40 border-x-0 border-t-0 text-ground">
        <div className="container-page flex h-[60px] items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/" aria-label="Back to the shop" className="flex items-center">
              <Wordmark size="footer" />
            </Link>
            <span className="text-[10px] uppercase tracking-[0.2em] text-ground/70">{title}</span>
            {badge}
          </div>
          <div className="flex items-center gap-5">
            {right}
            <form action={logoutAction}>
              <button className="min-h-[44px] text-[11px] uppercase tracking-label underline underline-offset-[6px]">
                Sign out
              </button>
            </form>
          </div>
        </div>
        <nav
          aria-label={title}
          className="no-scrollbar container-page flex items-center gap-6 overflow-x-auto border-t border-white/15"
        >
          {links.map(link)}
          {secondary.length > 0 && <span aria-hidden className="h-4 w-px shrink-0 bg-white/25" />}
          {secondary.map(link)}
        </nav>
      </header>
      <main id="main" className="container-page py-10">
        {children}
      </main>
      {mobileTabs && <StudioTabBar tabs={mobileTabs} />}
    </div>
  );
}
