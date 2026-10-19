'use client';

import './globals.css';
import { ErrorState, useReportError } from '@/components/states/ErrorState';

/** When the root layout itself fails: same state, with its own html and body. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useReportError(error);
  return (
    <html lang="en-AU">
      <body className="min-h-screen bg-ground">
        <main id="main" className="flex min-h-screen items-center justify-center">
          <ErrorState reset={reset} />
        </main>
      </body>
    </html>
  );
}
