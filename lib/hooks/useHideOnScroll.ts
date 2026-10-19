'use client';

import { useEffect, useState } from 'react';

/**
 * True while the page is scrolling down past the header, false as soon as it scrolls back up
 * (or reaches the top). Small jitters under `delta` pixels are ignored.
 */
export function useHideOnScroll({
  disabled = false,
  delta = 6,
  after = 120,
}: { disabled?: boolean; delta?: number; after?: number } = {}): boolean {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (disabled) {
      setHidden(false);
      return;
    }
    let last = window.scrollY;
    let frame = 0;
    const read = () => {
      frame = 0;
      const y = window.scrollY;
      if (y <= after) setHidden(false);
      else if (y - last > delta) setHidden(true);
      else if (last - y > delta) setHidden(false);
      else return;
      last = y;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [disabled, delta, after]);
  return hidden;
}
