'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { isPhone } from '@/lib/app/nav';
import { MODE_COOKIE } from '@/lib/app/mode-shared';

/** A maker who left the app in Studio mode reopens it there (phones, the Home screen only). */
export function ModeGate({ isMaker }: { isMaker: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (!isMaker || pathname !== '/' || !isPhone()) return;
    if (new RegExp(`(^|; )${MODE_COOKIE}=studio`).test(document.cookie)) router.replace('/studio');
  }, [isMaker, pathname, router]);
  return null;
}
