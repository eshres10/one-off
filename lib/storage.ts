import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '@/lib/env';
import { imageSize } from '@/lib/image-size';
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

/** Long edge for catalogue photos after resizing. */
export const PHOTO_MAX_EDGE = 2000;

/**
 * Catalogue photos (pieces, shop images): straightened from EXIF, resized to a 2000px long
 * edge, saved as WebP with a JPEG copy alongside (same name, .jpg) for anything that can't
 * show WebP. Falls back to storing the original if image processing isn't available.
 */
async function processPhoto(bytes: Uint8Array) {
  try {
    const sharp = (await import('sharp')).default;
    const base = sharp(bytes, { failOn: 'none' }).rotate().resize({
      width: PHOTO_MAX_EDGE,
      height: PHOTO_MAX_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    });
    const [webp, jpeg] = await Promise.all([
      base.clone().webp({ quality: 82 }).toBuffer({ resolveWithObject: true }),
      base.clone().jpeg({ quality: 84, mozjpeg: true }).toBuffer(),
    ]);
    return { webp: webp.data, jpeg, width: webp.info.width, height: webp.info.height };
  } catch {
    return null;
  }
}

async function put(name: string, bytes: Uint8Array, contentType: string): Promise<string> {
  const e = env();
  if (e.STORAGE_DRIVER === 'supabase') {
    const { supabaseAdmin } = await import('@/lib/auth/supabase');
    const client = supabaseAdmin();
    const { error } = await client.storage
      .from(e.SUPABASE_STORAGE_BUCKET)
      .upload(name, bytes, { contentType, upsert: false });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    return client.storage.from(e.SUPABASE_STORAGE_BUCKET).getPublicUrl(name).data.publicUrl;
  }
  const file = path.join(LOCAL_UPLOAD_DIR, name);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
  return `/api/files/${name}`;
}

export async function storeImage(
  bytes: Uint8Array,
  declaredType: string,
  prefix:
    | 'products'
    | 'messages'
    | 'commissions'
    | 'makers'
    | 'reviews'
    | 'collections'
    | 'stories',
  /** A folder under the prefix (stories/{product id}/); the month otherwise. */
  folder?: string,
) {
  const type = validateImage(bytes, declaredType);
  const sub =
    folder && /^[0-9a-f-]{36}$/i.test(folder) ? folder : new Date().toISOString().slice(0, 7);
  const stem = `${prefix}/${sub}/${randomUUID()}`;
  if (prefix === 'products' || prefix === 'makers' || prefix === 'stories') {
    const photo = await processPhoto(bytes);
    if (photo) {
      // The size travels in the name (…-1200x1600.webp) so listings can reserve the right space.
      const name = `${stem}-${photo.width}x${photo.height}`;
      const [url] = await Promise.all([
        put(`${name}.webp`, photo.webp, 'image/webp'),
        put(`${name}.jpg`, photo.jpeg, 'image/jpeg'),
      ]);
      return { path: `${name}.webp`, url, width: photo.width, height: photo.height };
    }
  }
  const size = imageSize(bytes);
  const name = `${stem}${size ? `-${size.width}x${size.height}` : ''}.${TYPES[type].ext}`;
  const url = await put(name, bytes, type);
  return { path: name, url, width: size?.width ?? null, height: size?.height ?? null };
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
  if (
    url.startsWith('/api/files/') ||
    url.startsWith('/api/messages/media/') ||
    url.startsWith('/seed/') ||
    url.startsWith('/preview/')
  )
    return !url.includes('..');
  const base = env().NEXT_PUBLIC_SUPABASE_URL;
  return Boolean(base && url.startsWith(`${base}/storage/v1/object/public/`));
}
