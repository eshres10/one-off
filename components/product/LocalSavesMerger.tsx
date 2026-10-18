'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { mergeLocalSavesAction } from '@/lib/actions/social';
import { readLocalSaves, writeLocalSaves } from '@/lib/local-saves';

/** Mounted for signed-in shoppers: moves any signed-out saves into the account once. */
export function LocalSavesMerger() {
  const router = useRouter();
  useEffect(() => {
    const ids = readLocalSaves();
    if (!ids.length) return;
    mergeLocalSavesAction(ids)
      .then(() => {
        writeLocalSaves([]);
        router.refresh();
      })
      .catch(() => {
        // Keep them locally and try again on the next page load.
      });
  }, [router]);
  return null;
}
