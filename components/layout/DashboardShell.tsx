import Link from 'next/link';
import { logoutAction } from '@/lib/actions/auth';
import { Wordmark } from '@/components/ui/Wordmark';

/** Seller/admin chrome: same visual language as the shop, denser. */
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
    <div className="min-h-screen bg-ground">
      <header className="glass-light sticky top-0 z-40">
        <div className="container-page flex h-[60px] items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <Link href="/" aria-label="Back to the shop">
              <Wordmark size="footer" />
            </Link>
            <span className="text-[11px] uppercase tracking-label text-muted-2">{title}</span>
            {badge}
          </div>
          <form action={logoutAction}>
            <button className="min-h-[44px] text-[11px] uppercase tracking-label underline underline-offset-[6px]">
              Sign out
            </button>
          </form>
        </div>
        <nav
          aria-label={title}
          className="no-scrollbar container-page flex gap-6 overflow-x-auto border-t border-line"
        >
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="flex min-h-[44px] shrink-0 items-center gap-1.5 text-[11px] uppercase tracking-label hover:underline hover:underline-offset-[6px]"
            >
              {l.label}
              {l.count ? (
                <span className="bg-ink px-1.5 text-[10px] text-ground">{l.count}</span>
              ) : null}
            </Link>
          ))}
        </nav>
      </header>
      <main id="main" className="container-page py-10">
        {children}
      </main>
    </div>
  );
}
