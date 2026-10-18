'use client';

import { useId, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { submitClaimAction } from '@/lib/actions/claims';
import { CLAIM_REASONS, RETURNS } from '@/lib/content/returns';
import type { FormState } from '@/lib/validation';
import { FormAlert } from '@/components/ui/Field';

const MAX_PHOTOS = 6;
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_EDGE = 2048;

interface Photo {
  key: string;
  name: string;
  preview: string | null;
  status: 'uploading' | 'done' | 'error';
  path?: string;
  error?: string;
}

function typeOf(file: File): string {
  if (file.type) return file.type === 'image/jpg' ? 'image/jpeg' : file.type;
  if (/\.heic$/i.test(file.name)) return 'image/heic';
  if (/\.heif$/i.test(file.name)) return 'image/heif';
  return '';
}

/**
 * Shrinks photos to at most 2048px JPEG before upload. Browsers that can't decode a format
 * (most can't read HEIC) send the original, which the server accepts up to 10 MB.
 */
async function compress(file: File): Promise<{ blob: Blob; type: string }> {
  const type = typeOf(file);
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    if (blob && (blob.size < file.size || type.startsWith('image/hei')))
      return { blob, type: 'image/jpeg' };
  } catch {
    // Not decodable here; upload the original.
  }
  return { blob: file, type };
}

async function upload(file: File): Promise<string> {
  const { blob, type } = await compress(file);
  if (!['image/jpeg', 'image/png', 'image/heic', 'image/heif'].includes(type))
    throw new Error('Photos must be JPG, PNG or HEIC.');
  if (blob.size > MAX_BYTES) throw new Error('Each photo must be 10 MB or smaller.');
  const res = await fetch('/api/claims/uploads', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contentType: type, size: blob.size }),
  });
  const prep = (await res.json().catch(() => ({}))) as {
    path?: string;
    uploadUrl?: string;
    error?: string;
  };
  if (!res.ok || !prep.path || !prep.uploadUrl) throw new Error(prep.error ?? 'Upload failed.');
  const put = await fetch(prep.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': type, 'x-upsert': 'false' },
    body: blob,
  });
  if (!put.ok) {
    const err = (await put.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? 'Upload failed. Please try again.');
  }
  return prep.path;
}

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="glass-dark min-h-[56px] w-full text-[12px] uppercase tracking-[0.2em] disabled:opacity-60"
    >
      {pending ? 'Sending…' : 'Send report'}
    </button>
  );
}

export function ClaimForm({ orderItemId, custom }: { orderItemId: string; custom: boolean }) {
  const [state, action] = useFormState<FormState, FormData>(submitClaimAction, undefined);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [details, setDetails] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const e = state?.errors ?? {};
  const reasons = CLAIM_REASONS.filter((r) => custom || r.value !== 'custom_fit');
  const uploading = photos.some((p) => p.status === 'uploading');
  const done = photos.filter((p) => p.status === 'done' && p.path);

  async function addFiles(files: FileList | null) {
    if (!files) return;
    const room = MAX_PHOTOS - photos.filter((p) => p.status !== 'error').length;
    const picked = Array.from(files).slice(0, Math.max(0, room));
    for (const file of picked) {
      const key = `${file.name}-${file.size}-${Math.random()}`;
      const preview = /^image\/(jpeg|png)$/.test(typeOf(file)) ? URL.createObjectURL(file) : null;
      setPhotos((prev) => [...prev, { key, name: file.name, preview, status: 'uploading' }]);
      upload(file)
        .then((path) =>
          setPhotos((prev) =>
            prev.map((p) => (p.key === key ? { ...p, status: 'done', path } : p)),
          ),
        )
        .catch((err: Error) =>
          setPhotos((prev) =>
            prev.map((p) => (p.key === key ? { ...p, status: 'error', error: err.message } : p)),
          ),
        );
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  const remove = (key: string) => setPhotos((prev) => prev.filter((p) => p.key !== key));

  return (
    <form action={action} className="space-y-7" data-testid="claim-form">
      <input type="hidden" name="orderItemId" value={orderItemId} />
      <input type="hidden" name="photos" value={JSON.stringify(done.map((p) => p.path))} />

      <fieldset aria-describedby={e.reason ? `${id}-reason-error` : undefined}>
        <legend className="label">What’s wrong?</legend>
        <div className="mt-1 space-y-2">
          {reasons.map((r) => (
            <label
              key={r.value}
              className="flex min-h-[48px] cursor-pointer items-center gap-3 border border-line bg-surface px-4 has-[:checked]:border-ink"
            >
              <input type="radio" name="reason" value={r.value} required className="accent-ink" />
              <span className="text-[14px]">{r.label}</span>
            </label>
          ))}
        </div>
        {e.reason && (
          <p id={`${id}-reason-error`} className="mt-1.5 text-[12px] text-error" role="alert">
            {e.reason}
          </p>
        )}
      </fieldset>

      <div>
        <label htmlFor={`${id}-details`} className="label">
          Tell us what happened
        </label>
        <textarea
          id={`${id}-details`}
          name="details"
          required
          minLength={20}
          maxLength={4000}
          rows={5}
          value={details}
          onChange={(ev) => setDetails(ev.target.value)}
          className="input min-h-[120px]"
          placeholder="Where is the fault, and when did you notice it?"
          aria-invalid={e.details ? true : undefined}
          aria-describedby={`${id}-details-hint${e.details ? ` ${id}-details-error` : ''}`}
        />
        <p id={`${id}-details-hint`} className="mt-1.5 text-[12px] text-muted-2" aria-live="polite">
          {details.trim().length < 20
            ? `At least 20 characters (${details.trim().length}/20)`
            : `${details.trim().length} characters`}
        </p>
        {e.details && (
          <p id={`${id}-details-error`} className="mt-1 text-[12px] text-error" role="alert">
            {e.details}
          </p>
        )}
      </div>

      <div>
        <label htmlFor={`${id}-photos`} className="label">
          Photos (1–6)
        </label>
        <p id={`${id}-photos-hint`} className="mb-2 text-[12px] text-muted-2">
          Show the problem clearly. JPG, PNG or HEIC, up to 10 MB each.
        </p>
        <input
          ref={fileRef}
          id={`${id}-photos`}
          type="file"
          accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif"
          multiple
          onChange={(ev) => addFiles(ev.target.files)}
          disabled={photos.filter((p) => p.status !== 'error').length >= MAX_PHOTOS}
          aria-describedby={`${id}-photos-hint${e.photos ? ` ${id}-photos-error` : ''}`}
          className="block w-full text-[13px] file:mr-3 file:min-h-[44px] file:border file:border-ink file:bg-surface file:px-4 file:text-[11px] file:uppercase file:tracking-label"
        />
        {photos.length > 0 && (
          <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6" aria-label="Photos added">
            {photos.map((p) => (
              <li key={p.key} className="relative">
                <div className="flex aspect-square items-center justify-center overflow-hidden bg-stone-light">
                  {p.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.preview} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="px-1 text-center text-[10px] text-muted">{p.name}</span>
                  )}
                </div>
                <p
                  className={`mt-1 text-[11px] ${p.status === 'error' ? 'text-error' : 'text-muted-2'}`}
                  aria-live="polite"
                >
                  {p.status === 'uploading'
                    ? 'Uploading…'
                    : p.status === 'done'
                      ? 'Added'
                      : p.error}
                </p>
                <button
                  type="button"
                  onClick={() => remove(p.key)}
                  className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center bg-[rgba(246,244,240,0.92)] text-[14px]"
                  aria-label={`Remove ${p.name}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        {e.photos && (
          <p id={`${id}-photos-error`} className="mt-1.5 text-[12px] text-error" role="alert">
            {e.photos}
          </p>
        )}
      </div>

      <FormAlert message={state?.errors ? undefined : state?.message} />
      <div>
        <Submit disabled={uploading || done.length === 0} />
        <p className="mt-2 text-center text-[12px] text-muted-2">
          The maker replies within 2 business days. {RETURNS.aclNote}
        </p>
      </div>
    </form>
  );
}
