'use client';

import type { InstallTrigger } from './rules';

/** Asks the install provider to consider showing the "Add to home screen" sheet. */
export function requestInstallSheet(trigger: InstallTrigger, delayMs = 0) {
  if (typeof window === 'undefined') return;
  window.setTimeout(
    () => window.dispatchEvent(new CustomEvent('oo:install', { detail: { trigger } })),
    delayMs,
  );
}
