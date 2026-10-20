'use client';

import { useEffect, useState } from 'react';
import { Switch } from '@/components/studio/Switch';
import { track } from '@/lib/client/track';
import { pushState, turnOffPush, turnOnPush, type PushState } from '@/lib/client/push';

/**
 * Account → Notifications: drop alerts on this phone or browser. Turning it on asks for
 * permission (from this tap, never on load); off unsubscribes. When the browser has blocked
 * notifications, it says how to unblock them instead.
 */
export function DropAlertsSwitch() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void pushState().then(setState);
  }, []);
  if (state === null) return null;
  return (
    <div className="border-b border-line py-2" data-testid="drop-alerts">
      <div className="flex min-h-[64px] items-center justify-between gap-4">
        <span>
          <span id="n-drop-alerts" className="block text-[15px]">
            Drop alerts
          </span>
          <span className="block text-[13px] text-muted">
            A nudge on this device when a maker you follow drops something new. At most one a day.
          </span>
        </span>
        <Switch
          checked={state === 'on'}
          disabled={busy || state === 'unsupported' || state === 'denied'}
          labelledBy="n-drop-alerts"
          testId="drop-alerts-switch"
          onChange={async (on) => {
            setBusy(true);
            const next = on ? await turnOnPush() : await turnOffPush();
            setBusy(false);
            setState(next);
            if (on)
              track(next === 'on' ? 'push_enabled' : 'push_declined', {
                state: next,
                from: 'settings',
              });
          }}
        />
      </div>
      {state === 'denied' && (
        <p className="pb-3 text-[13px] text-muted" role="status" data-testid="drop-alerts-denied">
          Notifications are blocked for Off One. To turn them back on: on iPhone, open Settings,
          then Notifications, then Off One. On Android, press and hold the Off One icon, tap App
          info, then Notifications. Then come back and flip this on.
        </p>
      )}
      {state === 'unsupported' && (
        <p className="pb-3 text-[13px] text-muted" role="status">
          This browser can’t show drop alerts. On iPhone, add Off One to your home screen and open
          it from there (iOS 16.4 or later).
        </p>
      )}
    </div>
  );
}
