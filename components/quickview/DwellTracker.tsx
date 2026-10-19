'use client';

import { useEffect } from 'react';
import { quickViewDwellAction } from '@/lib/actions/social';

/** Counts a quick view held open for more than five seconds towards the shopper's taste. */
export function DwellTracker({ productId }: { productId: string }) {
  useEffect(() => {
    const t = window.setTimeout(() => void quickViewDwellAction(productId), 5000);
    return () => window.clearTimeout(t);
  }, [productId]);
  return null;
}
