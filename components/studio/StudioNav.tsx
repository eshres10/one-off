'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BoxIcon, ChatIcon, PlusSquareIcon, SunIcon, WalletIcon } from '@/components/ui/icons';

export interface StudioCounts {
  toShip: number;
  needsReply: number;
}

const isActive = (pathname: string, href: string) =>
  href === '/studio'
    ? pathname === '/studio'
    : pathname === href || pathname.startsWith(`${href}/`);

/** Desktop Studio nav, inside the black glass bar. The current page gets a 1px underline. */
export function StudioNav({ counts }: { counts: StudioCounts }) {
  const pathname = usePathname() ?? '';
  const links = [
    { href: '/studio', label: 'Overview' },
    { href: '/studio/orders', label: 'Orders', count: counts.toShip },
    { href: '/studio/listings', label: 'Listings' },
    { href: '/studio/messages', label: 'Messages', count: counts.needsReply },
    { href: '/studio/payouts', label: 'Payouts' },
  ];
  return (
    <nav aria-label="Studio" className="hidden items-center gap-7 md:flex">
      {links.map((l) => {
        const on = isActive(pathname, l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            data-tour={`nav-${l.label.toLowerCase()}`}
            aria-current={on ? 'page' : undefined}
            className={`flex min-h-[44px] items-center gap-1.5 text-[11px] uppercase tracking-label underline-offset-[7px] ${on ? 'underline decoration-1' : 'text-ground/75 hover:text-ground'}`}
          >
            {l.label}
            {l.count ? (
              <span className="text-ground/75" aria-label={`, ${l.count} waiting`}>
                ({l.count})
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Phone tab bar: Today, Orders, Listings, Messages, Payouts. Tapping Listings while already on
 * your listings opens add-a-piece (the tab shows a "+").
 */
export function StudioTabs({ counts }: { counts: StudioCounts }) {
  const pathname = usePathname() ?? '';
  // Full-screen flows hide the bar.
  if (/^\/studio\/(messages\/[^/]+|listings\/new|listings\/[^/]+$)/.test(pathname)) return null;
  const onListings = pathname === '/studio/listings';
  const tabs = [
    { href: '/studio', label: 'Today', icon: SunIcon, testId: 'stab-today' },
    {
      href: '/studio/orders',
      label: 'Orders',
      icon: BoxIcon,
      count: counts.toShip,
      testId: 'stab-orders',
    },
    {
      href: onListings ? '/studio/listings/new' : '/studio/listings',
      match: '/studio/listings',
      label: onListings ? 'Add piece' : 'Listings',
      icon: PlusSquareIcon,
      testId: 'stab-listings',
    },
    {
      href: '/studio/messages',
      label: 'Messages',
      icon: ChatIcon,
      count: counts.needsReply,
      testId: 'stab-messages',
    },
    { href: '/studio/payouts', label: 'Payouts', icon: WalletIcon, testId: 'stab-payouts' },
  ];
  return (
    <nav
      aria-label="Studio tabs"
      data-tabbar
      className="glass-dark fixed inset-x-0 bottom-0 z-40 border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)] text-ground md:hidden"
    >
      <ul className="grid h-16 grid-cols-5" role="list">
        {tabs.map(({ href, match, label, icon: Icon, count, testId }) => {
          const on = isActive(pathname, match ?? href);
          return (
            <li key={testId}>
              <Link
                href={href}
                data-testid={testId}
                aria-current={on ? 'page' : undefined}
                aria-label={count ? `${label}, ${count} waiting` : label}
                className={`relative flex h-full flex-col items-center justify-center gap-1.5 ${on ? 'text-ground' : 'text-ground/60'}`}
              >
                <span className="relative">
                  <Icon width={21} height={21} strokeWidth={on ? 1.6 : 1.3} />
                  {count ? (
                    <span
                      aria-hidden
                      className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-circle bg-ground px-1 text-[9px] text-ink"
                    >
                      {count}
                    </span>
                  ) : null}
                </span>
                <span className="text-[10px] uppercase tracking-[0.12em]">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
