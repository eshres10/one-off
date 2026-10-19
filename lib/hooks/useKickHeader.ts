'use client';

import { useEffect, useState, type RefObject } from 'react';

/**
 * Homepage header: it stays over the hero until the content sheet (`[data-shutter]`) reaches its
 * bottom edge, then the sheet "kicks" it up, moving it 1:1 with the scroll until it's gone.
 * Scrolling back up slides it in again; scrolling down hides it again. Back over the hero, it's
 * simply there. Writes the transform straight to the element (no re-render per frame) and
 * returns whether it's fully out of view, for `--header-offset`.
 */
export function useKickHeader(
  ref: RefObject<HTMLElement>,
  { enabled, delta = 6 }: { enabled: boolean; delta?: number },
): boolean {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    let last = window.scrollY;
    let revealed = false;
    let frame = 0;
    const apply = (y: number, mode: 'track' | 'animate') => {
      el.dataset.kick = mode;
      el.style.transform = y ? `translateY(${y}px)` : '';
      setGone(y <= -el.offsetHeight + 1);
    };
    const read = () => {
      frame = 0;
      const sheet = document.querySelector<HTMLElement>('[data-shutter]');
      const scrollY = window.scrollY;
      const dir = scrollY - last;
      const h = el.offsetHeight;
      // How far the content has pushed into the header (≤ 0: not touching yet).
      const overlap = sheet ? h - sheet.getBoundingClientRect().top : scrollY > 120 ? h : 0;
      if (Math.abs(dir) > delta) {
        if (dir < 0) revealed = true;
        else revealed = false;
        last = scrollY;
      }
      if (overlap <= 0) {
        revealed = false;
        apply(0, 'track');
      } else if (revealed) apply(0, 'animate');
      else if (overlap < h && el.dataset.kick !== 'animate') apply(-overlap, 'track');
      else apply(-h, el.dataset.kick === 'animate' ? 'animate' : 'track');
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(frame);
      el.style.transform = '';
      delete el.dataset.kick;
      setGone(false);
    };
  }, [ref, enabled, delta]);
  return gone;
}
