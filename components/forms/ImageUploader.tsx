'use client';

import { useRef, useState } from 'react';
import { ImageIcon, CloseIcon } from '@/components/ui/icons';

const ACCEPT = 'image/jpeg,image/png,image/webp';

export function ImageUploader({
  name = 'imageUrls',
  kind,
  max = 4,
  initial = [],
  label = 'Add photos',
  onChange,
}: {
  name?: string;
  kind: 'messages' | 'commissions' | 'products' | 'reviews' | 'makers';
  max?: number;
  initial?: string[];
  label?: string;
  onChange?: (urls: string[]) => void;
}) {
  const [urls, setUrls] = useState<string[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const update = (next: string[]) => {
    setUrls(next);
    onChange?.(next);
  };

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setBusy(true);
    const next = [...urls];
    for (const file of Array.from(files).slice(0, max - urls.length)) {
      if (!ACCEPT.split(',').includes(file.type)) {
        setError('Images must be JPEG, PNG or WebP.');
        continue;
      }
      if (file.size > 8 * 1024 * 1024) {
        setError('Images must be 8 MB or smaller.');
        continue;
      }
      const body = new FormData();
      body.set('file', file);
      body.set('kind', kind);
      const res = await fetch('/api/uploads', { method: 'POST', body });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !json.url) setError(json.error ?? 'Upload failed.');
      else next.push(json.url);
    }
    update(next);
    setBusy(false);
    if (input.current) input.current.value = '';
  }

  return (
    <div>
      {urls.map((u) => (
        <input key={u} type="hidden" name={name} value={u} />
      ))}
      <div className="flex flex-wrap items-center gap-2">
        {urls.map((u) => (
          <span key={u} className="relative h-16 w-16 overflow-hidden rounded-lg bg-stone-light">
            <img src={u} alt="Attached image" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => update(urls.filter((x) => x !== u))}
              className="absolute right-0.5 top-0.5 rounded-full bg-white/90 p-0.5"
              aria-label="Remove image"
            >
              <CloseIcon width={14} height={14} />
            </button>
          </span>
        ))}
        {urls.length < max && (
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-stone bg-white px-3 py-2 text-sm hover:border-ink">
            <ImageIcon width={16} height={16} />
            {busy ? 'Uploading…' : label}
            <input
              ref={input}
              type="file"
              accept={ACCEPT}
              multiple
              className="sr-only"
              onChange={(e) => upload(e.target.files)}
              disabled={busy}
            />
          </label>
        )}
      </div>
      {error && (
        <p className="mt-1 text-sm text-alert" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
