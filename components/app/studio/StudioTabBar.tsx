'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BoxIcon, ChatIcon, PlusIcon, SunIcon, UserIcon } from '@/components/ui/icons';

export interface StudioTabCounts {
  orders: number;
  inbox: number;
}

/** Full-screen Studio flows hide the bar. */
export function hidesStudioTabBar(pathname: string) {
  return /^\/studio\/(orders\/[^/]+|inbox\/requests\/[^/]+|messages\/[^/]+|new|listings\/new|listings\/[^/]+)$/.test(
    pathname,
  );
}

const isActive = (pathname: string, href: string) =>
  href === '/studio'
    ? pathname === '/studio'
    : pathname === href || pathname.startsWith(`${href}/`);

/** The Studio tab bar on phones: Today, Orders, a black +, Inbox, Shop. */
export function StudioTabBar({ counts }: { counts: StudioTabCounts }) {
  const pathname = usePathname() ?? '';
  if (hidesStudioTabBar(pathname)) return null;
  const tabs = [
    { href: '/studio', label: 'Today', icon: SunIcon, testId: 'stab-today' },
    {
      href: '/studio/orders',
      label: 'Orders',
      icon: BoxIcon,
      count: counts.orders,
      testId: 'stab-orders',
    },
    { href: '/studio/new', label: 'List a piece', icon: PlusIcon, testId: 'stab-new', plus: true },
    {
      href: '/studio/inbox',
      label: 'Inbox',
      icon: ChatIcon,
      count: counts.inbox,
      testId: 'stab-inbox',
      match: '/studio/inbox',
    },
    { href: '/studio/shop', label: 'Shop', icon: UserIcon, testId: 'stab-shop' },
  ];
  return (
    <nav
      aria-label="Studio tabs"
      data-tabbar
      data-testid="studio-tabbar"
      className="glass-nav fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid h-16 grid-cols-5" role="list">
        {tabs.map(({ href, match, label, icon: Icon, count, testId, plus }) => {
          const on =
            isActive(pathname, match ?? href) ||
            (href === '/studio/inbox' && pathname.startsWith('/studio/messages'));
          return (
            <li key={testId}>
              <Link
                href={href}
                data-testid={testId}
                data-no-transition={plus ? undefined : ''}
                aria-current={on ? 'page' : undefined}
                aria-label={count ? `${label}, ${count} waiting` : label}
                className={`relative flex h-full min-h-[44px] flex-col items-center justify-center gap-1.5 ${on ? 'text-ink' : 'text-[#8A857E]'}`}
              >
                {plus ? (
                  <span className="-mt-1 flex h-11 w-11 items-center justify-center rounded-circle bg-ink text-ground shadow-[0_6px_16px_rgba(17,17,17,0.25)]">
                    <Icon width={22} height={22} strokeWidth={1.8} />
                  </span>
                ) : (
                  <>
                    <span className="relative">
                      <Icon width={22} height={22} strokeWidth={on ? 1.7 : 1.4} />
                      {count ? (
                        <span
                          aria-hidden
                          data-testid={`${testId}-count`}
                          className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-pill bg-[#8A2E1C] px-1 text-[9px] leading-none text-ground"
                        >
                          {count}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-[10px] leading-none tracking-[0.04em]">{label}</span>
                  </>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
