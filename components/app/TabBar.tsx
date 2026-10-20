'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { BagIcon, ChatIcon, CompassIcon, HomeIcon, SearchIcon } from '@/components/ui/icons';
import { TAB_ROOT, isPushedScreen, tabFor, type TabKey } from './tabs';

export interface PhoneTabCounts {
  inbox: number;
  bag: number;
}

interface Memory {
  path: string;
  y: number;
}

const CURRENT_KEY = 'oo.tab.current';
const memKey = (tab: TabKey) => `oo.tab.${tab}`;

function read<T>(key: string): T | null {
  try {
    const v = sessionStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode: tabs simply don't remember where you were.
  }
}

/**
 * The buyer tab bar: Home, Explore, Discover, Inbox (unread badge) and Bag (item count). Each
 * tab remembers its own screen and scroll position; tapping the active tab goes back to the
 * tab's root, then to the top. Hidden on pushed screens and at md and up (the desktop header).
 */
export function PhoneTabBar({ counts }: { counts: PhoneTabCounts }) {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const search = useSearchParams()?.toString() ?? '';
  const here = pathname + (search ? `?${search}` : '');
  // Which tab this screen lives in: a clear one, else the one you were last in (read after
  // hydration, since the server can't see sessionStorage).
  const [stored, setStored] = useState<TabKey | null>(null);
  useEffect(() => setStored(read<TabKey>(CURRENT_KEY)), [pathname]);
  const active: TabKey = tabFor(pathname) ?? stored ?? 'home';
  const pending = useRef<Memory | null>(null);

  // Remember where this tab is, as it scrolls.
  useEffect(() => {
    write(CURRENT_KEY, active);
    let raf = 0;
    const save = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() =>
        write(memKey(active), { path: here, y: window.scrollY } satisfies Memory),
      );
    };
    save();
    window.addEventListener('scroll', save, { passive: true });
    window.addEventListener('pagehide', save);
    return () => {
      window.removeEventListener('scroll', save);
      window.removeEventListener('pagehide', save);
      cancelAnimationFrame(raf);
    };
  }, [active, here]);

  // Coming back to a tab: put it where it was.
  useEffect(() => {
    const m = pending.current;
    if (m && m.path === here) {
      pending.current = null;
      requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, m.y)));
    }
  }, [here]);

  if (isPushedScreen(pathname, search ? `?${search}` : '')) return null;

  const tabs: Array<{
    key: TabKey;
    label: string;
    icon: typeof HomeIcon;
    count?: number;
    alert?: boolean;
  }> = [
    { key: 'home', label: 'Home', icon: HomeIcon },
    { key: 'explore', label: 'Explore', icon: SearchIcon },
    { key: 'discover', label: 'Discover', icon: CompassIcon },
    { key: 'inbox', label: 'Inbox', icon: ChatIcon, count: counts.inbox, alert: true },
    { key: 'bag', label: 'Bag', icon: BagIcon, count: counts.bag },
  ];

  const onTap = (e: React.MouseEvent, tab: TabKey) => {
    e.preventDefault();
    const root = TAB_ROOT[tab];
    if (tab === active) {
      if (pathname === root) window.scrollTo({ top: 0, behavior: 'smooth' });
      else router.push(root);
      return;
    }
    const m = read<Memory>(memKey(tab));
    if (m && m.path.startsWith(root)) {
      pending.current = m;
      router.push(m.path, { scroll: false });
    } else router.push(root);
  };

  return (
    <nav
      aria-label="App"
      data-tabbar="shop"
      data-testid="phone-tabbar"
      className="glass-nav fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid h-16 grid-cols-5" role="list">
        {tabs.map(({ key, label, icon: Icon, count, alert }) => {
          const on = key === active;
          return (
            <li key={key}>
              <Link
                href={TAB_ROOT[key]}
                onClick={(e) => onTap(e, key)}
                aria-current={on ? 'page' : undefined}
                aria-label={count ? `${label}, ${count}` : label}
                data-testid={`tab-${key}`}
                data-no-transition=""
                className={`relative flex h-full min-h-[44px] flex-col items-center justify-center gap-1.5 ${on ? 'text-ink' : 'text-[#8A857E]'}`}
              >
                <span className="relative">
                  <Icon width={22} height={22} strokeWidth={on ? 1.7 : 1.4} />
                  {count ? (
                    <span
                      aria-hidden
                      data-testid={`tab-${key}-count`}
                      className={`absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-pill px-1 text-[9px] leading-none text-ground ${alert ? 'bg-[#8A2E1C]' : 'bg-ink'}`}
                    >
                      {count > 99 ? '99+' : count}
                    </span>
                  ) : null}
                </span>
                <span className="text-[10px] leading-none tracking-[0.04em]">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
