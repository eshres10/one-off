'use client';

import { ErrorState, useReportError } from '@/components/states/ErrorState';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useReportError(error);
  return (
    <main id="main" className="flex min-h-[70vh] items-center justify-center">
      <ErrorState reset={reset} />
    </main>
  );
}
