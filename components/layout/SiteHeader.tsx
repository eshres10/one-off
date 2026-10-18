import Link from 'next/link';
import { BRAND } from '@/lib/brand';
import { getSessionUser } from '@/lib/auth/session';
import { cartCount } from '@/lib/services/cart';
import { checkoutEnabled } from '@/lib/features';
import { getCartSessionId } from '@/lib/actions/util';
import { BagIcon } from '@/components/ui/icons';
import { Wordmark } from '@/components/ui/Wordmark';
import { MobileMenu } from './MobileMenu';

const PRIMARY = [
  { href: '/', label: 'Discover' },
  { href: '/collections', label: 'Collections' },
  { href: '/makers', label: 'Makers' },
  { href: '/?tab=following', label: 'Following' },
];

const navLink = 'text-[11px] uppercase tracking-label hover:underline hover:underline-offset-[6px]';

export async function SiteHeader() {
  const checkoutOn = checkoutEnabled();
  const [user, count] = await Promise.all([
    getSessionUser(),
    checkoutOn ? cartCount(getCartSessionId()) : Promise.resolve(0),
  ]);
  const accountHref = user
    ? user.role === 'seller'
      ? '/seller'
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
    ...PRIMARY,
    { href: '/search', label: 'Search' },
    { href: '/account/saved', label: 'Saved' },
    ...(user
      ? [
          {
            href: user.role === 'seller' ? '/seller/messages' : '/account/messages',
            label: 'Messages',
          },
        ]
      : []),
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
      <p className="bg-ink px-4 py-2 text-center text-[10px] uppercase tracking-label text-ground sm:text-[11px]">
        {BRAND.announcement}
      </p>
      <header className="glass-light sticky top-0 z-40">
        <div className="container-page grid h-[60px] grid-cols-[1fr_auto_1fr] items-center md:h-[76px]">
          <div className="flex items-center">
            <div className="md:hidden">
              <MobileMenu links={menuLinks} />
            </div>
            <nav aria-label="Primary" className="hidden items-center gap-7 md:flex">
              {PRIMARY.map((n) => (
                <Link key={n.href} href={n.href} className={navLink}>
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
          <Link href="/" aria-label={`${BRAND.name} home`} className="justify-self-center">
            <Wordmark />
          </Link>
          <div className="flex items-center justify-end gap-6">
            <nav aria-label="Account" className="hidden items-center gap-6 md:flex">
              <Link href="/search" className={navLink}>
                Search
              </Link>
              <Link href="/account/saved" className={navLink}>
                Saved
              </Link>
              {user && (
                <Link
                  href={user.role === 'seller' ? '/seller/messages' : '/account/messages'}
                  className={navLink}
                >
                  Messages
                </Link>
              )}
              <Link href={accountHref} className={navLink}>
                {accountLabel}
              </Link>
              {checkoutOn && (
                <Link
                  href="/bag"
                  className={navLink}
                  data-testid="bag-link"
                  aria-label={`Bag, ${count} ${count === 1 ? 'item' : 'items'}`}
                >
                  Bag ({count})
                </Link>
              )}
            </nav>
            {checkoutOn && (
              <Link
                href="/bag"
                className="relative flex h-11 w-11 items-center justify-center md:hidden"
                aria-label={`Bag, ${count} ${count === 1 ? 'item' : 'items'}`}
              >
                <BagIcon />
                {count > 0 && (
                  <span aria-hidden className="absolute right-1 top-1.5 text-[10px] font-medium">
                    {count}
                  </span>
                )}
              </Link>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
