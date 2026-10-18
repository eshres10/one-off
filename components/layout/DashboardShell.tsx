import Link from 'next/link';
import { BRAND } from '@/lib/brand';
import { logoutAction } from '@/lib/actions/auth';

export function DashboardShell({
  title,
  links,
  badge,
  children,
}: {
  title: string;
  links: Array<{ href: string; label: string; count?: number }>;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-stone/70 bg-white">
        <div className="container-page flex h-14 items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="font-display text-lg">
              {BRAND.name}
            </Link>
            <span className="rounded-full bg-stone-light px-2.5 py-0.5 text-xs font-medium">
              {title}
            </span>
            {badge}
          </div>
          <form action={logoutAction}>
            <button className="text-sm text-ink-muted hover:text-ink">Sign out</button>
          </form>
        </div>
        <nav
          aria-label={title}
          className="no-scrollbar container-page flex gap-1 overflow-x-auto pb-2"
        >
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="shrink-0 rounded-full px-3 py-1.5 text-sm text-ink-soft hover:bg-stone-light hover:text-ink"
            >
              {l.label}
              {l.count ? (
                <span className="ml-1.5 rounded-full bg-clay px-1.5 text-[11px] font-semibold text-white">
                  {l.count}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>
      </header>
      <main id="main" className="container-page py-8">
        {children}
      </main>
    </div>
  );
}
