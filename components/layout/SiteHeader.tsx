import Link from 'next/link';
import { BRAND } from '@/lib/brand';
import { getSessionUser } from '@/lib/auth/session';
import { cartCount } from '@/lib/services/cart';
import { getCartSessionId } from '@/lib/actions/util';
import { BagIcon, ChatIcon, HeartIcon, UserIcon } from '@/components/ui/icons';

const NAV = [
  { href: '/', label: 'Discover' },
  { href: '/collections', label: 'Collections' },
  { href: '/makers', label: 'Makers' },
  { href: '/?tab=new', label: 'New this week' },
];

export async function SiteHeader() {
  const [user, count] = await Promise.all([getSessionUser(), cartCount(getCartSessionId())]);
  const iconLink =
    'relative inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-stone-light';
  return (
    <header className="sticky top-0 z-40 border-b border-stone/60 bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/80">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-ink focus:px-3 focus:py-2 focus:text-paper"
      >
        Skip to content
      </a>
      <div className="container-page flex h-14 items-center justify-between gap-4 sm:h-16">
        <Link
          href="/"
          className="font-display text-xl tracking-tight sm:text-2xl"
          aria-label={`${BRAND.name} home`}
        >
          {BRAND.name}
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-6 text-sm md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="text-ink-soft hover:text-ink">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-0.5">
          {user?.role === 'seller' && (
            <Link
              href="/seller"
              className="mr-1 hidden rounded-full border border-stone px-3 py-1.5 text-xs font-medium sm:inline-block"
            >
              Seller dashboard
            </Link>
          )}
          {user?.role === 'admin' && (
            <Link
              href="/admin"
              className="mr-1 hidden rounded-full border border-stone px-3 py-1.5 text-xs font-medium sm:inline-block"
            >
              Admin
            </Link>
          )}
          <Link href="/account/saved" className={iconLink} aria-label="Saved pieces">
            <HeartIcon />
          </Link>
          {user && (
            <Link
              href={user.role === 'seller' ? '/seller/messages' : '/account/messages'}
              className={iconLink}
              aria-label="Messages"
            >
              <ChatIcon />
            </Link>
          )}
          <Link
            href={user ? '/account' : '/login'}
            className={iconLink}
            aria-label={user ? 'Your account' : 'Sign in'}
          >
            <UserIcon />
          </Link>
          <Link
            href="/bag"
            className={iconLink}
            aria-label={`Bag, ${count} ${count === 1 ? 'item' : 'items'}`}
            data-testid="bag-link"
          >
            <BagIcon />
            {count > 0 && (
              <span
                className="absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-ink px-1 text-[10px] font-semibold text-paper"
                aria-hidden
              >
                {count}
              </span>
            )}
          </Link>
        </div>
      </div>
      <nav
        aria-label="Sections"
        className="no-scrollbar container-page flex gap-5 overflow-x-auto pb-2.5 text-sm md:hidden"
      >
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className="shrink-0 text-ink-soft hover:text-ink">
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
