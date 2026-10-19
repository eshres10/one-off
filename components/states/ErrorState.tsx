'use client';

import { startTransition, useEffect } from 'react';
import { EmptyState } from './EmptyState';
import { NeedleIcon } from './illustrations';

/** Sends the error to the server log once; never throws. */
export function useReportError(error: Error & { digest?: string }) {
  useEffect(() => {
    console.error(error);
    try {
      void fetch('/api/client-errors', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: String(error.message ?? 'Unknown error').slice(0, 500),
          digest: error.digest,
          path: window.location.pathname,
        }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      // Reporting is best effort.
    }
  }, [error]);
}

/** "A dropped stitch.": something broke on our side; try again or go home. */
export function ErrorState({ reset, refresh }: { reset: () => void; refresh?: () => void }) {
  // A server render that failed is cached in the page; reset() alone would show the same error,
  // so fetch the segment again (when there's a router to ask) and re-render it together.
  const retry = () =>
    startTransition(() => {
      refresh?.();
      reset();
    });
  return (
    <EmptyState
      testId="error-state"
      level={1}
      icon={<NeedleIcon size={96} />}
      title="A dropped stitch."
      body="Something went wrong on our side. Your bag and any payment are safe. Give it another try in a moment."
      actions={[
        {
          label: 'Try again',
          button: (
            <button
              type="button"
              onClick={retry}
              className="glass-dark min-h-[52px] w-full px-6 text-[11px] uppercase tracking-[0.2em] text-ground"
              data-testid="error-retry"
            >
              Try again
            </button>
          ),
        },
        { label: 'Back to home', href: '/' },
      ]}
      footnote="Error 500 · We’ve been notified"
    />
  );
}
