'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { SITE } from '@/lib/site/config';

/** Phone-only routes send a desktop browser to today's page for the same thing. */
export function DesktopRedirect({ to }: { to: string }) {
  const router = useRouter();
  useEffect(() => {
    if (window.matchMedia(`(min-width: ${SITE.app.phoneBreakpoint}px)`).matches) router.replace(to);
  }, [router, to]);
  return null;
}
