'use client';

import { useEffect } from 'react';
import { requestInstallSheet } from '@/lib/install/trigger';
import type { InstallTrigger } from '@/lib/install/rules';

/** Asks for the install sheet when this renders (e.g. on the order confirmation). */
export function InstallTriggerOnMount({
  trigger,
  delayMs = 2500,
}: {
  trigger: InstallTrigger;
  delayMs?: number;
}) {
  useEffect(() => requestInstallSheet(trigger, delayMs), [trigger, delayMs]);
  return null;
}
