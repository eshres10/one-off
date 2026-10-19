'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Press and hold: calls `onLongPress` after `delay` ms if the finger (or mouse) stays put.
 * Moving more than `tolerance` px (a scroll) cancels it. The click that ends a long press is
 * swallowed, so the card's link doesn't open as well, and so is the browser's own long-press
 * menu. `pressing` is true while a hold is under way, for a little "squeeze" feedback.
 */
export function useLongPress(onLongPress: () => void, { delay = 450, tolerance = 10 } = {}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const [pressing, setPressing] = useState(false);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
    setPressing(false);
  }, []);
  useEffect(() => clear, [clear]);

  return {
    pressing,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.button !== 0 || !e.isPrimary) return;
        fired.current = false;
        start.current = { x: e.clientX, y: e.clientY };
        setPressing(true);
        timer.current = setTimeout(() => {
          fired.current = true;
          setPressing(false);
          timer.current = null;
          navigator.vibrate?.(12);
          onLongPress();
        }, delay);
      },
      onPointerMove: (e: React.PointerEvent) => {
        const s = start.current;
        if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > tolerance) clear();
      },
      onPointerUp: clear,
      onPointerCancel: clear,
      onPointerLeave: clear,
      onClickCapture: (e: React.MouseEvent) => {
        if (fired.current) {
          e.preventDefault();
          e.stopPropagation();
          fired.current = false;
        }
      },
      onContextMenu: (e: React.MouseEvent) => {
        if (timer.current || fired.current) e.preventDefault();
      },
    },
  };
}
