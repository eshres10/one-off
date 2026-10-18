import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { logoutAction } from '@/lib/actions/auth';

const LINKS = [
  { href: '/account', label: 'Overview' },
  { href: '/account/orders', label: 'Orders' },
  { href: '/account/saved', label: 'Saved' },
  { href: '/account/following', label: 'Following' },
  { href: '/account/messages', label: 'Messages' },
  { href: '/account/measurements', label: 'Measurements' },
  { href: '/account/commissions', label: 'Custom requests' },
];

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser('/account');
  return (
    <div className="container-page pt-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Your account</p>
          <p className="mt-1 font-display text-2xl">{user.displayName ?? user.email}</p>
        </div>
        <form action={logoutAction}>
          <button className="text-sm text-ink-muted underline underline-offset-4 hover:text-ink">
            Sign out
          </button>
        </form>
      </div>
      <nav
        aria-label="Account"
        className="no-scrollbar -mx-4 mt-6 flex gap-2 overflow-x-auto border-b border-stone/70 px-4 pb-3 sm:mx-0 sm:px-0"
      >
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="shrink-0 rounded-full px-3 py-1.5 text-sm text-ink-soft hover:bg-stone-light hover:text-ink"
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="pt-8">{children}</div>
    </div>
  );
}
