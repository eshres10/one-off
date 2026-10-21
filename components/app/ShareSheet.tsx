'use client';

import { Sheet } from './Sheet';
import { toast } from './Toast';
import { ChatIcon, ShareIcon } from '@/components/ui/icons';

/** Share: the system sheet where there is one, a copied link everywhere. */
export function ShareSheet({
  open,
  onOpenChange,
  title,
  path,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  path: string;
}) {
  const url = () => `${window.location.origin}${path}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url());
      toast('Link copied');
    } catch {
      toast('Couldn’t copy the link');
    }
    onOpenChange(false);
  };
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title, url: url() });
      else await copy();
    } catch {
      // Dismissed: nothing to do.
    }
    onOpenChange(false);
  };
  const row = 'flex min-h-[56px] w-full items-center gap-3 text-[15px]';
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Share" testId="share-sheet">
      <ul className="divide-y divide-line" role="list">
        <li>
          <button type="button" onClick={share} className={row} data-testid="share-system">
            <ShareIcon width={18} height={18} /> Share…
          </button>
        </li>
        <li>
          <button type="button" onClick={copy} className={row} data-testid="share-copy">
            <ChatIcon width={18} height={18} /> Copy link
          </button>
        </li>
      </ul>
    </Sheet>
  );
}
