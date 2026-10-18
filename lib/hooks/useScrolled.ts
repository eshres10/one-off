'use client';

import { useEffect, useState, type RefObject } from 'react';

/**
 * True once the window (or the given scroll container) has scrolled past `threshold` pixels.
 * Listens passively and only re-renders when the boolean flips.
 */
export function useScrolled(threshold = 8, container?: RefObject<HTMLElement>): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const el = container?.current ?? null;
    const target: HTMLElement | Window = el ?? window;
    const read = () => setScrolled((el ? el.scrollTop : window.scrollY) > threshold);
    read();
    target.addEventListener('scroll', read, { passive: true });
    return () => target.removeEventListener('scroll', read);
  }, [threshold, container]);
  return scrolled;
}
