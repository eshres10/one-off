'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Monogram } from '@/components/ui/Monogram';
import { LoopLoader } from '@/components/ui/LoopLoader';
import { track } from '@/lib/client/track';
import { turnOnPush, type PushState } from '@/lib/client/push';
import { detectHere } from '@/lib/install/detect';

export const FIRST_OPEN_KEY = 'pwa_first_open_seen';
const LOADER_MS = 1400;

function seen(): boolean {
  try {
    return window.localStorage.getItem(FIRST_OPEN_KEY) === '1';
  } catch {
    return false;
  }
}
function markSeen() {
  try {
    window.localStorage.setItem(FIRST_OPEN_KEY, '1');
  } catch {
    // Without storage it may show again next launch; harmless.
  }
}

/**
 * The first launch from the home screen (?source=pwa, in standalone mode, once): the Loop
 * loader, then "You're in." with the one place we ever ask for notification permission.
 */
export function FirstOpen() {
  const params = useSearchParams();
  const [stage, setStage] = useState<'none' | 'loading' | 'in'>('none');
  const [result, setResult] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const primary = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (params?.get('source') !== 'pwa' || seen()) return;
    if (detectHere(false) !== 'installed') return;
    markSeen();
    setStage('loading');
  }, [params]);

  useEffect(() => {
    if (stage !== 'loading') return;
    const t = window.setTimeout(() => setStage('in'), LOADER_MS);
    return () => window.clearTimeout(t);
  }, [stage]);

  useEffect(() => {
    if (stage === 'in') primary.current?.focus();
  }, [stage, result]);

  if (stage === 'none') return null;
  if (stage === 'loading') return <LoopLoader label="Opening One Off" />;
  const close = () => setStage('none');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="first-open-title"
      className="install-fade fixed inset-0 z-[95] flex flex-col bg-ground px-6"
      style={{
        paddingTop: 'max(48px, env(safe-area-inset-top))',
        paddingBottom: 'max(26px, env(safe-area-inset-bottom))',
      }}
      data-testid="first-open"
    >
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <Monogram className="h-16 w-16 text-ink" />
        <h1 id="first-open-title" className="mt-8 font-display text-[44px] leading-none">
          You’re in.
        </h1>
        <p className="mt-5 max-w-[320px] text-[15px] leading-relaxed text-text2">
          One Off now lives on your home screen. Want a nudge when a maker you follow drops
          something new?
        </p>
        {result === 'denied' && (
          <p
            className="mt-5 max-w-[320px] text-[13px] text-muted"
            role="status"
            data-testid="first-open-denied"
          >
            Notifications are off for One Off. You can turn them on any time in your phone’s
            Settings, under Notifications.
          </p>
        )}
        {(result === 'off' || result === 'unsupported') && (
          <p className="mt-5 max-w-[320px] text-[13px] text-muted" role="status">
            Drop alerts aren’t available here yet. You can try again from Account, Notifications.
          </p>
        )}
      </div>
      {result === null ? (
        <div className="w-full">
          <button
            ref={primary}
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const state = await turnOnPush();
              setBusy(false);
              track(state === 'on' ? 'push_enabled' : 'push_declined', {
                state,
                from: 'first_open',
              });
              if (state === 'on') close();
              else setResult(state);
            }}
            className="min-h-[52px] w-full bg-ink text-[11px] uppercase tracking-[0.2em] text-ground disabled:opacity-60"
            data-testid="first-open-alerts"
          >
            Turn on drop alerts
          </button>
          <button
            type="button"
            onClick={close}
            className="mt-3 min-h-[44px] w-full text-[13px] underline underline-offset-[3px]"
            data-testid="first-open-later"
          >
            Maybe later
          </button>
          <p className="mt-4 text-center text-[11px] uppercase tracking-[0.2em] text-muted">
            At most one alert a day
          </p>
        </div>
      ) : (
        <button
          ref={primary}
          type="button"
          onClick={close}
          className="min-h-[52px] w-full bg-ink text-[11px] uppercase tracking-[0.2em] text-ground"
        >
          Start exploring
        </button>
      )}
    </div>
  );
}
