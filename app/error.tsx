'use client';

import { useEffect } from 'react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main
      id="main"
      className="container-page flex min-h-[60vh] flex-col items-center justify-center text-center"
    >
      <h1 className="text-3xl">Something went wrong</h1>
      <p className="mt-2 text-ink-muted">
        Please try again. If it keeps happening, contact us
        {error.digest ? ` and quote ${error.digest}` : ''}.
      </p>
      <button
        onClick={reset}
        className="mt-6 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper"
      >
        Try again
      </button>
    </main>
  );
}
