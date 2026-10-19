'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { markReturnReceivedAction, reportReturnProblemAction } from '@/lib/actions/returns';
import { MAX_PHOTOS, upload } from '@/components/claims/upload';

/**
 * "Mark as received" refunds the buyer straight away. "There's a problem with it" never rejects
 * the return by itself: it sends photos and a note to One Off, who decide.
 */
export function ReturnActions({ returnId, number }: { returnId: string; number: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<'idle' | 'confirm' | 'problem' | 'sent'>('idle');
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const received = () =>
    start(async () => {
      setError(null);
      const res = await markReturnReceivedAction(returnId);
      if (!res.ok) return setError(res.message);
      router.refresh();
    });

  const sendProblem = () =>
    start(async () => {
      setError(null);
      const res = await reportReturnProblemAction({ returnId, note, photos });
      if (!res.ok) return setError(res.message);
      setMode('sent');
      router.refresh();
    });

  async function addFiles(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files).slice(0, MAX_PHOTOS - photos.length)) {
      setUploading((n) => n + 1);
      try {
        const path = await upload(file);
        setPhotos((p) => [...p, path]);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  const btn =
    'inline-flex min-h-[44px] items-center justify-center px-4 text-[11px] uppercase tracking-[0.18em]';
  if (mode === 'sent')
    return (
      <p className="text-[13px]" role="status">
        Sent to One Off. We’ll decide and let you both know.
      </p>
    );
  return (
    <div className="space-y-2 text-left" data-testid={`return-actions-${number}`}>
      {mode === 'idle' && (
        <div className="flex flex-wrap gap-2 md:justify-end">
          <button
            type="button"
            onClick={() => setMode('confirm')}
            className={`${btn} glass-dark text-ground`}
            data-testid="mark-received"
          >
            Mark as received
          </button>
          <button
            type="button"
            onClick={() => setMode('problem')}
            className={`${btn} border border-ink`}
            data-testid="return-problem"
          >
            There’s a problem with it
          </button>
        </div>
      )}
      {mode === 'confirm' && (
        <div className="max-w-[320px] bg-stone p-4 text-[13px] md:ml-auto">
          <p>It’s arrived unworn, with tags? The buyer is refunded the item price now.</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={received}
              disabled={pending}
              className={`${btn} glass-dark text-ground`}
              data-testid="confirm-received"
            >
              {pending ? 'Refunding…' : 'Yes, refund'}
            </button>
            <button
              type="button"
              onClick={() => setMode('idle')}
              className={`${btn} border border-ink`}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {mode === 'problem' && (
        <div className="max-w-[420px] bg-stone p-4 text-[13px] md:ml-auto">
          <p>
            Worn, damaged or missing tags? Tell us what’s wrong and add photos. One Off decides; the
            return isn’t rejected automatically.
          </p>
          <label className="mt-3 block">
            <span className="block">What’s wrong with it</span>
            <textarea
              className="input mt-1 min-h-[90px]"
              value={note}
              maxLength={2000}
              onChange={(e) => setNote(e.target.value)}
              data-testid="return-problem-note"
            />
          </label>
          <div className="mt-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif"
              multiple
              onChange={(e) => addFiles(e.target.files)}
              className="text-[12px]"
              data-testid="return-problem-photos"
            />
            <p className="mt-1 text-[12px] text-muted">
              {uploading
                ? 'Uploading…'
                : `${photos.length} photo${photos.length === 1 ? '' : 's'} added`}
            </p>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={sendProblem}
              disabled={pending || uploading > 0 || note.trim().length < 20 || !photos.length}
              className={`${btn} glass-dark text-ground disabled:opacity-50`}
              data-testid="send-return-problem"
            >
              {pending ? 'Sending…' : 'Send to One Off'}
            </button>
            <button
              type="button"
              onClick={() => setMode('idle')}
              className={`${btn} border border-ink`}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="text-[13px] text-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
