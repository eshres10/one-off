'use client';

import { useEffect, useState } from 'react';
import { localSavedPiecesAction } from '@/lib/actions/social';
import { onLocalSavesChange, readLocalSaves } from '@/lib/local-saves';
import type { SavedPiece } from '@/lib/queries/saved';
import { ProductGridSkeleton } from '@/components/product/ProductCard';
import { SavedView } from './SavedView';

/** Signed-out Saved page: pieces come from this browser's localStorage. */
export function LocalSaved({ checkoutOn }: { checkoutOn: boolean }) {
  const [pieces, setPieces] = useState<SavedPiece[] | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => {
      const ids = readLocalSaves();
      if (!ids.length) return setPieces([]);
      localSavedPiecesAction(ids)
        .then((p) => live && setPieces(p))
        .catch(() => live && setPieces([]));
    };
    load();
    const off = onLocalSavesChange(() => {
      // Removals are already reflected in the view; only reload when something was added.
      if (readLocalSaves().length > (pieces?.length ?? 0)) load();
    });
    return () => {
      live = false;
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!pieces) return <ProductGridSkeleton count={4} />;
  return <SavedView pieces={pieces} makers={null} signedIn={false} checkoutOn={checkoutOn} />;
}
