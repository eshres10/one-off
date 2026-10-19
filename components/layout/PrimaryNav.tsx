'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { PRIMARY_NAV, currentNavKey, navLinkClass } from '@/lib/nav/primary';

/** Plain-link version of the primary nav (tablet widths, and the base for the mega menu). */
export function PrimaryNavLinks() {
  const pathname = usePathname() ?? '/';
  const params = useSearchParams();
  const current = currentNavKey(pathname, params?.get('sort') ?? null, params?.get('cat') ?? null);
  return (
    <>
      {PRIMARY_NAV.map((n) => (
        <Link
          key={n.key}
          href={n.href}
          aria-current={current === n.key ? 'page' : undefined}
          className={navLinkClass(current === n.key)}
        >
          {n.label}
        </Link>
      ))}
    </>
  );
}
