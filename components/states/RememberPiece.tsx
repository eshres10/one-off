'use client';

import { useEffect } from 'react';
import { rememberPiece, type RecentPiece } from '@/lib/client/recent';

/** Records a product view for the offline screen's "recently viewed". Renders nothing. */
export function RememberPiece(piece: RecentPiece) {
  useEffect(() => {
    rememberPiece(piece);
  }, [piece.slug]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
