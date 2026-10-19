'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavItem } from '@/lib/account/nav';

/** Desktop: the account sections down the left, with counts. */
export function AccountSidebar({ items }: { items: NavItem[] }) {
  const path = usePathname() ?? '';
  return (
    <ul className="space-y-0.5" role="list">
      {items.map((i) => {
        const current = path === i.href || path.startsWith(`${i.href}/`);
        return (
          <li key={i.href}>
            <Link
              href={i.href}
              aria-current={current ? 'page' : undefined}
              className={`flex min-h-[40px] items-center justify-between gap-3 text-[14px] ${current ? 'text-ink underline underline-offset-[6px]' : 'text-muted hover:text-ink'}`}
              data-testid={i.testId}
            >
              <span>{i.label}</span>
              {i.value && (
                <span
                  className={`text-[11px] ${i.label === 'Orders' && i.value ? 'bg-[#C9A88A]/25 px-2 py-0.5 text-ink' : 'text-muted-2'}`}
                >
                  {i.value}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Phone: subpages get a way back to the account home. */
export function AccountBack() {
  const path = usePathname() ?? '';
  if (path === '/account') return null;
  return (
    <Link
      href="/account"
      className="mb-4 flex min-h-[44px] items-center text-[12px] uppercase tracking-label md:hidden"
      data-testid="account-back"
    >
      ‹ Account
    </Link>
  );
}
