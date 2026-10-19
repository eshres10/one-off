'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Phone tab bar for the maker studio. Hidden inside a message thread (full screen). */
export function StudioTabBar({
  tabs,
}: {
  tabs: Array<{ href: string; label: string; count?: number }>;
}) {
  const pathname = usePathname() ?? '';
  if (/^\/seller\/messages\/[^/]+/.test(pathname)) return null;
  return (
    <nav
      aria-label="Studio"
      data-tabbar
      className="glass-dark fixed inset-x-0 bottom-0 z-40 border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)] text-ground md:hidden"
    >
      <ul
        className="grid h-16"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
        role="list"
      >
        {tabs.map((t) => {
          const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? 'page' : undefined}
                className={`relative flex h-full flex-col items-center justify-center gap-1 text-[10px] uppercase tracking-[0.12em] ${active ? 'text-ground' : 'text-ground/60'}`}
              >
                {t.label}
                {t.count ? (
                  <span className="bg-ground px-1.5 text-[9px] leading-4 text-ink">{t.count}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
