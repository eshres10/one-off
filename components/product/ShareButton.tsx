'use client';

import { useState } from 'react';
import { ShareIcon } from '@/components/ui/icons';

/** Native share sheet where available; otherwise copies the page link. */
export function ShareButton({ title, className = '' }: { title: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={copied ? 'Link copied' : `Share ${title}`}
      onClick={async () => {
        const url = window.location.href;
        try {
          if (navigator.share) await navigator.share({ title, url });
          else {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }
        } catch {
          // Dismissed share sheet or blocked clipboard: nothing to do.
        }
      }}
      className={`flex h-11 w-11 items-center justify-center text-ink ${className}`}
    >
      <ShareIcon width={16} height={16} />
      <span className="sr-only" aria-live="polite">
        {copied ? 'Link copied' : ''}
      </span>
    </button>
  );
}
