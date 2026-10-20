'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { SITE } from '@/lib/site/config';

type Listener = (message: string) => void;
const listeners = new Set<Listener>();

/** Raises a toast from anywhere on the client: "Added to bag", "Link copied"… */
export function toast(message: string) {
  if (typeof window === 'undefined') return;
  listeners.forEach((l) => l(message));
}

/** A black pill above the tab bar that goes after SITE.app.toastMs. One at a time, newest wins. */
export function ToastHost() {
  const [item, setItem] = useState<{ id: number; message: string } | null>(null);
  useEffect(() => {
    const l: Listener = (message) => setItem({ id: Date.now(), message });
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  useEffect(() => {
    if (!item) return;
    const t = setTimeout(() => setItem(null), SITE.app.toastMs);
    return () => clearTimeout(t);
  }, [item]);
  if (!item) return null;
  return createPortal(
    <div
      key={item.id}
      role="status"
      aria-live="polite"
      data-testid="toast"
      className="toast-in pointer-events-none fixed inset-x-0 bottom-[calc(var(--tabbar-h)+14px)] z-[90] flex justify-center px-4"
    >
      <span className="rounded-pill bg-ink px-4 py-2.5 text-[13px] text-ground shadow-[0_8px_24px_rgba(17,17,17,0.18)]">
        {item.message}
      </span>
    </div>,
    document.body,
  );
}
