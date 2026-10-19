'use client';

import { useEffect } from 'react';

/** Registers /sw.js in production, after the page has loaded. Never breaks the page. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    const register = () => {
      try {
        navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
      } catch {
        // Not available here (private mode, unsupported): the site works without it.
      }
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);
  return null;
}
