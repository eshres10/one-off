'use client';

import { useState } from 'react';

/**
 * "Share to Story": on phones, the 1080×1920 image goes to the share sheet (Instagram Stories
 * picks it up); elsewhere it downloads.
 */
export function ShareStory({
  href,
  filename,
  label = 'Share to Story',
}: {
  href: string;
  filename: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      data-testid="share-story"
      className="glass-dark min-h-[52px] w-full text-[11px] uppercase tracking-[0.18em] disabled:opacity-60"
      onClick={async () => {
        setBusy(true);
        try {
          const blob = await (await fetch(href)).blob();
          const file = new File([blob], filename, { type: 'image/png' });
          if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file] });
          } else {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = filename;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
          }
        } catch {
          // Share sheet dismissed.
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? 'Making your image…' : label}
    </button>
  );
}

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      data-testid="copy-shop-link"
      className="min-h-[52px] w-full border border-ink text-[11px] uppercase tracking-[0.18em]"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard blocked.
        }
      }}
    >
      <span aria-live="polite">{copied ? 'Copied ✓' : 'Copy shop link'}</span>
    </button>
  );
}
