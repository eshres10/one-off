'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { onLocalSavesChange, readLocalSaves } from '@/lib/local-saves';
import { HeartIcon } from '@/components/ui/icons';

/**
 * Phone shortcut to /saved, with a dot when anything is saved. The header shows it on Home;
 * Discover places its own beside the page title (`always`).
 */
export function SavedHeart({ count, always = false }: { count: number; always?: boolean }) {
  const pathname = usePathname() ?? '/';
  const [local, setLocal] = useState(0);
  useEffect(() => {
    const read = () => setLocal(readLocalSaves().length);
    read();
    return onLocalSavesChange(read);
  }, []);
  if (!always && pathname !== '/') return null;
  const any = count + local > 0;
  return (
    <Link
      href="/saved"
      aria-label={any ? 'Saved, has items' : 'Saved'}
      data-testid="header-saved"
      className="relative flex h-11 w-11 items-center justify-center xl:hidden"
    >
      <HeartIcon width={20} height={20} strokeWidth={1.4} />
      {any && (
        <span aria-hidden className="absolute right-2.5 top-2.5 h-2 w-2 rounded-circle bg-ink" />
      )}
    </Link>
  );
}
