'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BagIcon, ChatIcon, GridIcon, HomeIcon, SearchIcon } from '@/components/ui/icons';

export interface TabBarCounts {
  messages: number;
  bag: number;
}

/** Routes where the bar gets out of the way: checkout and the inside of a message thread. */
export function hidesTabBar(pathname: string) {
  return (
    pathname.startsWith('/checkout') ||
    /^\/messages\/[^/]+/.test(pathname) ||
    /^\/account\/messages\/[^/]+/.test(pathname)
  );
}

/** Phone and tablet app shell: fixed frosted-glass tab bar (below 1280px). */
export function TabBar({ counts, messagesHref }: { counts: TabBarCounts; messagesHref: string }) {
  const pathname = usePathname() ?? '/';
  if (hidesTabBar(pathname)) return null;
  const tabs = [
    { href: '/', label: 'Home', icon: HomeIcon, active: pathname === '/' },
    { href: '/search', label: 'Search', icon: SearchIcon, active: pathname.startsWith('/search') },
    {
      href: '/discover',
      label: 'Discover',
      icon: GridIcon,
      active: pathname.startsWith('/discover'),
      fill: true,
      testId: 'tab-discover',
    },
    {
      href: messagesHref,
      label: 'Messages',
      icon: ChatIcon,
      active: pathname.startsWith('/messages') || pathname.startsWith('/account/messages'),
      count: counts.messages,
      testId: 'tab-messages',
    },
    {
      href: '/bag',
      label: 'Bag',
      icon: BagIcon,
      active: pathname.startsWith('/bag'),
      count: counts.bag,
      testId: 'tab-bag',
    },
  ];
  return (
    <nav
      aria-label="App"
      data-tabbar="shop"
      className="glass-nav fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)] xl:hidden"
    >
      <ul className="grid h-16 grid-cols-5" role="list">
        {tabs.map(({ href, label, icon: Icon, active, fill, count, testId }) => (
          <li key={label}>
            <Link
              href={href}
              aria-current={active ? 'page' : undefined}
              aria-label={count ? `${label}, ${count}` : label}
              data-testid={testId}
              className={`relative flex h-full flex-col items-center justify-center gap-1.5 ${active ? 'text-ink' : 'text-[#8A857E]'}`}
            >
              <span className="relative">
                <Icon
                  width={22}
                  height={22}
                  strokeWidth={1.4}
                  {...(fill ? { filled: active } : {})}
                />
                {count ? (
                  <span
                    aria-hidden
                    data-testid={testId ? `${testId}-count` : undefined}
                    className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center bg-ink px-1 text-[9px] leading-none text-ground"
                  >
                    {count > 99 ? '99+' : count}
                  </span>
                ) : null}
              </span>
              <span className="text-[9px] uppercase leading-none tracking-[0.12em]">{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
