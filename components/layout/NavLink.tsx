'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentProps } from 'react';
import { navLinkClass } from '@/lib/nav/primary';

/** Header link that marks itself as the current page (aria-current + 1px underline). */
export function NavLink({
  href,
  match,
  ...rest
}: { href: string; match?: string } & Omit<ComponentProps<typeof Link>, 'href' | 'className'>) {
  const pathname = usePathname() ?? '/';
  const base = match ?? href.split('?')[0]!;
  const active = pathname === base || pathname.startsWith(`${base}/`);
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={navLinkClass(active)}
      {...rest}
    />
  );
}
