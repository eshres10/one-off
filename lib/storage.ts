import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '@/lib/env';
import { UserError } from '@/lib/services/errors';

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const TYPES = {
  'image/jpeg': { ext: 'jpg', magic: [[0xff, 0xd8, 0xff]] },
  'image/png': { ext: 'png', magic: [[0x89, 0x50, 0x4e, 0x47]] },
  'image/webp': { ext: 'webp', magic: [[0x52, 0x49, 0x46, 0x46]] },
} as const;
export type UploadContentType = keyof typeof TYPES;
export const ACCEPTED_IMAGE_TYPES = Object.keys(TYPES).join(',');

export const LOCAL_UPLOAD_DIR = path.join(process.cwd(), '.uploads');

/** Checks declared type, real file signature and size. SVG and other types are rejected. */
export function validateImage(bytes: Uint8Array, declaredType: string): UploadContentType {
  if (!(declaredType in TYPES)) throw new UserError('Images must be JPEG, PNG or WebP.');
  if (bytes.byteLength === 0) throw new UserError('That image is empty.');
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new UserError('Images must be 8 MB or smaller.');
  const type = declaredType as UploadContentType;
  const ok = TYPES[type].magic.some((sig) => sig.every((b, i) => bytes[i] === b));
  const webpOk = type !== 'image/webp' || String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (!ok || !webpOk) throw new UserError('That file doesn’t look like a valid image.');
  return type;
}

export async function storeImage(
  bytes: Uint8Array,
  declaredType: string,
  prefix: 'products' | 'messages' | 'commissions' | 'makers' | 'reviews' | 'collections',
) {
  const type = validateImage(bytes, declaredType);
  const name = `${prefix}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${TYPES[type].ext}`;
  const e = env();
  if (e.STORAGE_DRIVER === 'supabase') {
    const { supabaseAdmin } = await import('@/lib/auth/supabase');
    const client = supabaseAdmin();
    const { error } = await client.storage
      .from(e.SUPABASE_STORAGE_BUCKET)
      .upload(name, bytes, { contentType: type, upsert: false });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    const { data } = client.storage.from(e.SUPABASE_STORAGE_BUCKET).getPublicUrl(name);
    return { path: name, url: data.publicUrl };
  }
  const file = path.join(LOCAL_UPLOAD_DIR, name);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
  return { path: name, url: `/api/files/${name}` };
}

export async function readLocalFile(
  relative: string,
): Promise<{ bytes: Buffer; type: string } | null> {
  const normalised = path.normalize(relative).replace(/^(\.\.(\/|\\|$))+/, '');
  const full = path.join(LOCAL_UPLOAD_DIR, normalised);
  if (!full.startsWith(LOCAL_UPLOAD_DIR + path.sep)) return null;
  const ext = path.extname(full).slice(1);
  const type = Object.entries(TYPES).find(([, v]) => v.ext === ext)?.[0];
  if (!type) return null;
  try {
    return { bytes: await readFile(full), type };
  } catch {
    return null;
  }
}

/** Only accept image URLs we issued ourselves (prevents hot-linking arbitrary URLs in UGC). */
export function isOwnImageUrl(url: string): boolean {
  if (url.startsWith('/api/files/') || url.startsWith('/seed/')) return !url.includes('..');
  const base = env().NEXT_PUBLIC_SUPABASE_URL;
  return Boolean(base && url.startsWith(`${base}/storage/v1/object/public/`));
}
