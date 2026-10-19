'use client';

import type { InstallTrigger } from './rules';

export interface InstallRequest {
  trigger: InstallTrigger;
  /** What had focus when it was asked for (the heart, say), to give focus back on close. */
  opener: Element | null;
}

/** Asks the install provider to consider showing the "Add to home screen" sheet. */
export function requestInstallSheet(trigger: InstallTrigger, delayMs = 0) {
  if (typeof window === 'undefined') return;
  const opener = document.activeElement;
  window.setTimeout(
    () =>
      window.dispatchEvent(
        new CustomEvent<InstallRequest>('oo:install', { detail: { trigger, opener } }),
      ),
    delayMs,
  );
}
