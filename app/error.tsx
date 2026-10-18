'use client';

import { useEffect } from 'react';
import { SystemMessage } from '@/components/ui/SystemMessage';

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
    <SystemMessage
      code="500"
      title="Something went wrong"
      body={`Please try again. If it keeps happening, contact us${error.digest ? ` and quote ${error.digest}` : ''}.`}
      action={
        <button
          onClick={reset}
          className="text-[11px] uppercase tracking-label underline underline-offset-[6px]"
        >
          Try again
        </button>
      }
    />
  );
}
