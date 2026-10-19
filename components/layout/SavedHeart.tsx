'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { onLocalSavesChange, readLocalSaves } from '@/lib/local-saves';
import { HeartIcon } from '@/components/ui/icons';

/** Phone header shortcut to /saved on Home and Discover, with a dot when anything is saved. */
export function SavedHeart({ count }: { count: number }) {
  const pathname = usePathname() ?? '/';
  const [local, setLocal] = useState(0);
  useEffect(() => {
    const read = () => setLocal(readLocalSaves().length);
    read();
    return onLocalSavesChange(read);
  }, []);
  if (pathname !== '/' && !pathname.startsWith('/discover')) return null;
  const any = count + local > 0;
  return (
    <Link
      href="/saved"
      aria-label={any ? 'Saved, has items' : 'Saved'}
      data-testid="header-saved"
      className="relative flex h-11 w-11 items-center justify-center md:hidden"
    >
      <HeartIcon width={20} height={20} strokeWidth={1.4} />
      {any && (
        <span aria-hidden className="absolute right-2.5 top-2.5 h-2 w-2 rounded-circle bg-ink" />
      )}
    </Link>
  );
}
