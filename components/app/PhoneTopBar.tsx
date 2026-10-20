'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { popScreen } from '@/lib/app/nav';
import { Wordmark } from '@/components/ui/Wordmark';
import { BellIcon, ChevronIcon } from '@/components/ui/icons';
import { TAB_ROOT, isPushedScreen, tabFor } from './tabs';

export interface PhoneBarUser {
  initial: string;
  avatarUrl: string | null;
}

/** Screens that draw their own top (the product page, a chat, Explore and Discover's search). */
const OWN_CHROME = [
  /^\/products\//,
  /^\/(messages|account\/messages)\/[^/]+/,
  /^\/explore/,
  /^\/discover/,
];

const TITLES: Array<[RegExp, string]> = [
  [/^\/inbox/, 'Inbox'],
  [/^\/bag/, 'Bag'],
  [/^\/you/, 'You'],
  [/^\/saved/, 'Saved'],
  [/^\/search/, 'Search'],
  [/^\/makers$/, 'Makers'],
  [/^\/collections$/, 'Collections'],
  [/^\/account\/orders\/[^/]+/, 'Order'],
  [/^\/account\/orders/, 'Orders'],
  [/^\/account\/requests/, 'Custom requests'],
  [/^\/account\/sizes/, 'Sizes & fit'],
  [/^\/account/, 'Account'],
  [/^\/messages/, 'Messages'],
  [/^\/help/, 'Help'],
  [/^\/size-guide/, 'Size guide'],
  [/^\/how-it-works/, 'How it works'],
  [/^\/about/, 'Our story'],
  [/^\/legal/, 'Legal'],
  [/^\/login/, 'Sign in'],
  [/^\/pop-ups/, 'Pop-ups'],
];

export function Avatar({ user, size = 32 }: { user: PhoneBarUser; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-circle bg-ink text-[12px] uppercase text-ground"
      style={{ width: size, height: size }}
    >
      {user.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.avatarUrl} alt="" width={size} height={size} className="object-cover" />
      ) : (
        user.initial
      )}
    </span>
  );
}

/**
 * The phone top bar, one per screen: on Home the wordmark with the bell and your avatar; on a
 * tab root its title; on a pushed screen a back chevron and the title. Glass, sticky, phones only.
 */
export function PhoneTopBar({ user, unread }: { user: PhoneBarUser | null; unread: number }) {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const search = useSearchParams()?.toString() ?? '';
  if (OWN_CHROME.some((r) => r.test(pathname))) return null;
  if (isPushedScreen(pathname, search ? `?${search}` : '') && pathname !== '/bag') return null;

  const isRoot = Object.values(TAB_ROOT).includes(pathname);
  const title = TITLES.find(([r]) => r.test(pathname))?.[1] ?? null;
  const fallback = TAB_ROOT[tabFor(pathname) ?? 'home'];

  return (
    <div
      data-phone-bar
      data-testid="phone-bar"
      className="glass-nav sticky top-0 z-40 pt-[env(safe-area-inset-top)] md:hidden"
    >
      <div className="grid h-[var(--phone-bar-h)] grid-cols-[1fr_auto_1fr] items-center px-2">
        {pathname === '/' ? (
          <>
            <span className="pl-2">
              <Wordmark size="mobile" className="h-[22px]" />
            </span>
            <span />
            <span className="flex items-center justify-end gap-0.5">
              <Link
                href="/inbox?tab=notifications"
                aria-label={unread ? `Notifications, ${unread} new` : 'Notifications'}
                data-testid="bar-bell"
                className="relative flex h-11 w-11 items-center justify-center"
              >
                <BellIcon width={22} height={22} strokeWidth={1.4} />
                {unread ? (
                  <span
                    aria-hidden
                    className="absolute right-2.5 top-2.5 h-2 w-2 rounded-circle bg-[#8A2E1C]"
                  />
                ) : null}
              </Link>
              <Link
                href={user ? '/you' : '/login?next=/you'}
                aria-label={user ? 'You' : 'Sign in'}
                data-testid="bar-you"
                className="flex h-11 w-11 items-center justify-center"
              >
                {user ? (
                  <Avatar user={user} />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-circle border border-ink text-[11px] uppercase">
                    in
                  </span>
                )}
              </Link>
            </span>
          </>
        ) : (
          <>
            <span>
              {!isRoot && (
                <button
                  type="button"
                  onClick={() => popScreen(router, fallback)}
                  aria-label="Back"
                  data-testid="bar-back"
                  className="flex h-11 w-11 items-center justify-center"
                >
                  <ChevronIcon dir="left" width={20} height={20} strokeWidth={1.6} />
                </button>
              )}
            </span>
            <span className="text-[15px] font-normal" data-testid="bar-title">
              {title ?? <Wordmark size="mobile" className="h-[20px]" />}
            </span>
            <span />
          </>
        )}
      </div>
    </div>
  );
}
