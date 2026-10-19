import Link from 'next/link';
import { BRAND } from '@/lib/brand';
import { getSessionUser } from '@/lib/auth/session';
import { cartCount } from '@/lib/services/cart';
import { checkoutEnabled } from '@/lib/features';
import { getCartSessionId } from '@/lib/actions/util';
import { Wordmark } from '@/components/ui/Wordmark';
import { unreadCount } from '@/lib/services/messaging';
import { HeaderFrame, type HeaderVariant } from './HeaderFrame';
import { MobileMenu } from './MobileMenu';
import { PrimaryNavLinks } from './PrimaryNav';
import { PRIMARY_NAV } from '@/lib/nav/primary';
import { SavedHeart } from './SavedHeart';
import { NavLink } from './NavLink';
import { MegaMenu } from './MegaMenu';
import { getMenuMakers } from '@/lib/queries/nav';
import { resolveMega } from '@/lib/nav/mega';
import { getSavedCount } from '@/lib/queries/saved';

// Each strip is a fixed height (see --strip-h in globals.css) so pages can offset exactly.
const strip =
  'relative flex h-[var(--strip-h)] items-center justify-center bg-ink px-4 text-center text-[10px] leading-[14px] text-ground sm:text-[11px]';

/** Where the signed-in user's inbox lives (makers answer from the studio). */
export function messagesHref(role: string | undefined) {
  return role === 'seller' ? '/studio/messages' : '/messages';
}

export async function SiteHeader({ variant = 'auto' }: { variant?: HeaderVariant } = {}) {
  const checkoutOn = checkoutEnabled();
  const user = await getSessionUser();
  const [count, unread, saved, menuMakers] = await Promise.all([
    checkoutOn ? cartCount(getCartSessionId()) : Promise.resolve(0),
    user ? unreadCount(user).catch(() => 0) : Promise.resolve(0),
    user ? getSavedCount(user).catch(() => 0) : Promise.resolve(0),
    getMenuMakers().catch(() => ({ featured: [], newest: [] })),
  ]);
  const mega = resolveMega(menuMakers.featured, menuMakers.newest);
  const accountHref = user
    ? user.role === 'seller'
      ? '/studio'
      : user.role === 'admin'
        ? '/admin'
        : '/account'
    : '/login';
  const accountLabel = user
    ? user.role === 'seller'
      ? 'Studio'
      : user.role === 'admin'
        ? 'Admin'
        : 'Account'
    : 'Log in';
  const menuLinks = [
    ...PRIMARY_NAV.map(({ href, label }) => ({ href, label })),
    { href: '/search', label: 'Search' },
    { href: '/saved', label: 'Saved' },
    { href: messagesHref(user?.role), label: 'Messages' },
    { href: accountHref, label: accountLabel },
    { href: '/help/how-it-works', label: 'How it works' },
  ];
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[60] focus:bg-ink focus:px-3 focus:py-2 focus:text-ground"
      >
        Skip to content
      </a>
      {/* Fixed over the page; <main> and full-bleed heroes offset themselves by --header-h. */}
      <HeaderFrame variant={variant}>
        {!checkoutOn && (
          <p className={strip} data-preview-strip data-testid="preview-banner">
            <span className="line-clamp-2">
              Launching soon — explore the makers and save your favourites. Checkout opens at
              launch.
            </span>
          </p>
        )}
        <p className={`${strip} uppercase tracking-label`}>
          <span className="line-clamp-2">{BRAND.announcement}</span>
        </p>
        <div className="container-page relative grid h-[var(--nav-h)] grid-cols-[1fr_auto_1fr] items-center">
          <div className="flex items-center">
            <div className="md:hidden">
              <MobileMenu links={menuLinks} groups={mega} />
            </div>
            <nav aria-label="Primary" className="hidden items-center md:flex">
              <div className="flex items-center gap-7 lg:hidden">
                <PrimaryNavLinks />
              </div>
              <div className="hidden lg:flex">
                <MegaMenu panels={mega} />
              </div>
            </nav>
          </div>
          <Link href="/" aria-label={`${BRAND.name} home`} className="justify-self-center">
            <Wordmark />
          </Link>
          <div className="flex items-center justify-end gap-6">
            <SavedHeart count={saved} />
            <nav aria-label="Account" className="hidden items-center gap-6 md:flex">
              <NavLink href="/search" data-tour="search">
                Search
              </NavLink>
              <NavLink href={accountHref} data-tour="account">
                {accountLabel}
              </NavLink>
              <NavLink href="/saved">Saved</NavLink>
              <NavLink
                href={messagesHref(user?.role)}
                data-testid="header-messages"
                aria-label={`Messages, ${unread} unread`}
              >
                Messages ({unread})
              </NavLink>
              {checkoutOn && (
                <NavLink
                  href="/bag"
                  data-testid="bag-link"
                  data-tour="bag"
                  aria-label={`Bag, ${count} ${count === 1 ? 'item' : 'items'}`}
                >
                  Bag ({count})
                </NavLink>
              )}
            </nav>
          </div>
        </div>
      </HeaderFrame>
    </>
  );
}
