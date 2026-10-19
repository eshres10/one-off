'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { readRecent, type RecentPiece } from '@/lib/client/recent';
import { EmptyState } from './EmptyState';
import { CloudOffIcon } from './illustrations';

/**
 * Covers the page while the browser is offline: "You're offline." with the last pieces viewed
 * (from localStorage, so their images may come from the browser cache). Retries by itself when
 * the connection comes back. No service worker yet.
 */
export function OfflineGate() {
  const router = useRouter();
  const [offline, setOffline] = useState(false);
  const [recent, setRecent] = useState<RecentPiece[]>([]);

  useEffect(() => {
    const go = () => {
      setRecent(readRecent().slice(0, 3));
      setOffline(true);
    };
    const back = () => {
      setOffline((was) => {
        if (was) router.refresh();
        return false;
      });
    };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) go();
    window.addEventListener('offline', go);
    window.addEventListener('online', back);
    return () => {
      window.removeEventListener('offline', go);
      window.removeEventListener('online', back);
    };
  }, [router]);

  if (!offline) return null;
  return (
    <div
      className="fixed inset-0 z-[90] overflow-y-auto bg-ground"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="offline-title"
      data-testid="offline-state"
    >
      <div className="flex min-h-full items-center">
        <EmptyState
          icon={<CloudOffIcon size={96} />}
          title={<span id="offline-title">You’re offline.</span>}
          body="Check your connection. We’ll pick up where you left off as soon as you’re back."
          actions={[
            {
              label: 'Try again',
              button: (
                <button
                  type="button"
                  onClick={() => {
                    if (navigator.onLine) {
                      setOffline(false);
                      router.refresh();
                    }
                  }}
                  className="glass-dark min-h-[52px] w-full px-6 text-[11px] uppercase tracking-[0.2em] text-ground"
                  data-testid="offline-retry"
                >
                  Try again
                </button>
              ),
            },
          ]}
        >
          {recent.length > 0 && (
            <div className="text-left">
              <p className="mb-3 text-[11px] uppercase tracking-label text-muted-2">
                Recently viewed
              </p>
              <ul className="grid grid-cols-3 gap-2" role="list">
                {recent.map((p) => (
                  <li key={p.slug}>
                    <a href={`/products/${p.slug}`} className="block">
                      <span className="relative block aspect-4/5 overflow-hidden bg-stone">
                        {p.imageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.imageUrl}
                            alt=""
                            className="h-full w-full object-cover"
                            // Offline, an uncached photo can't load: leave the stone tile instead.
                            onError={(e) => (e.currentTarget.style.display = 'none')}
                          />
                        )}
                      </span>
                      <span className="mt-1.5 block truncate text-[12px]">{p.title}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </EmptyState>
      </div>
    </div>
  );
}
