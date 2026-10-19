import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { logoutAction } from '@/lib/actions/auth';

const LINKS = [
  { href: '/account', label: 'Overview' },
  { href: '/account/orders', label: 'Orders' },
  { href: '/saved', label: 'Saved' },
  { href: '/account/following', label: 'Following' },
  { href: '/messages', label: 'Messages' },
  { href: '/account/style', label: 'Your style' },
  { href: '/account/measurements', label: 'Measurements' },
  { href: '/account/commissions', label: 'Custom requests' },
  { href: '/account/help', label: 'Help' },
];

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser('/account');
  return (
    <div className="container-page pt-10 md:pt-14">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Your account</p>
          <p className="mt-2 font-display text-[40px] leading-none md:text-[48px]">
            {user.displayName ?? user.email}
          </p>
        </div>
        <form action={logoutAction}>
          <button className="min-h-[44px] text-[11px] uppercase tracking-label underline underline-offset-[6px]">
            Sign out
          </button>
        </form>
      </div>
      <nav
        aria-label="Account"
        className="no-scrollbar -mx-4 mt-8 flex gap-6 overflow-x-auto border-y border-line px-4 sm:mx-0 sm:px-0"
      >
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="flex min-h-[52px] shrink-0 items-center text-[11px] uppercase tracking-label hover:underline hover:underline-offset-[6px]"
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="pt-10">{children}</div>
    </div>
  );
}
