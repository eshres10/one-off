/** Claim photo uploads from the browser: shrink, then PUT to a signed upload URL. */

export const MAX_PHOTOS = 6;
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_EDGE = 2048;

export interface Photo {
  key: string;
  name: string;
  preview: string | null;
  status: 'uploading' | 'done' | 'error';
  path?: string;
  error?: string;
}

export function typeOf(file: File): string {
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

export async function upload(file: File): Promise<string> {
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
