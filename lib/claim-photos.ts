import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '@/lib/env';
import { UserError } from '@/lib/services/errors';

/**
 * Claim photos live in a private store: the Supabase `claims` bucket in production, or a
 * directory outside `public/` locally. They are never served from a public URL; viewers go
 * through /api/claims/[id]/photos/[n], which checks access to the claim first.
 *
 * Uploads go straight from the browser to storage (a signed upload URL), so large photos don't
 * pass through a serverless function's request size limit.
 */
export const CLAIM_BUCKET = 'claims';
export const MAX_CLAIM_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_CLAIM_PHOTOS = 6;

const TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/heif': 'heif',
} as const;
export type ClaimPhotoType = keyof typeof TYPES;
export const CLAIM_PHOTO_ACCEPT = 'image/jpeg,image/png,image/heic,image/heif,.heic,.heif';

const LOCAL_DIR = path.join(process.cwd(), '.uploads-private');
const HEIF_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1', 'heif'];

export function isClaimPhotoType(type: string): type is ClaimPhotoType {
  return type in TYPES;
}

/** Checks the file's real signature, not just its declared type. */
export function sniffClaimPhoto(bytes: Uint8Array): ClaimPhotoType | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    return 'image/png';
  const box = String.fromCharCode(...bytes.slice(4, 8));
  const brand = String.fromCharCode(...bytes.slice(8, 12));
  if (box === 'ftyp' && HEIF_BRANDS.includes(brand)) return 'image/heic';
  return null;
}

/** Photos are filed under the uploader's id; a claim may only reference its buyer's own photos. */
export function claimPhotoBelongsTo(objectPath: string, userId: string): boolean {
  return (
    objectPath.startsWith(`${userId}/`) &&
    !objectPath.includes('..') &&
    /^[0-9a-f-]+\/[0-9a-f-]+\.(jpg|png|heic|heif)$/.test(objectPath)
  );
}

const sign = (objectPath: string) =>
  createHmac('sha256', env().SESSION_SECRET).update(`claim-upload:${objectPath}`).digest('hex');

export function verifyLocalUploadSignature(objectPath: string, signature: string): boolean {
  const expected = Buffer.from(sign(objectPath));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export async function createClaimUpload(
  userId: string,
  contentType: string,
  size: number,
): Promise<{ path: string; uploadUrl: string }> {
  if (!isClaimPhotoType(contentType)) throw new UserError('Photos must be JPG, PNG or HEIC.');
  if (size <= 0 || size > MAX_CLAIM_PHOTO_BYTES)
    throw new UserError('Each photo must be 10 MB or smaller.');
  const objectPath = `${userId}/${randomUUID()}.${TYPES[contentType]}`;
  if (env().STORAGE_DRIVER === 'supabase') {
    const { supabaseAdmin } = await import('@/lib/auth/supabase');
    const { data, error } = await supabaseAdmin()
      .storage.from(CLAIM_BUCKET)
      .createSignedUploadUrl(objectPath);
    if (error || !data) throw new Error(`Could not prepare upload: ${error?.message}`);
    return { path: objectPath, uploadUrl: data.signedUrl };
  }
  const query = new URLSearchParams({ path: objectPath, sig: sign(objectPath) });
  return { path: objectPath, uploadUrl: `/api/claims/uploads/local?${query}` };
}

/** Local driver only: stores an upload made to the signed URL from createClaimUpload. */
export async function writeLocalClaimPhoto(objectPath: string, bytes: Uint8Array) {
  if (bytes.byteLength > MAX_CLAIM_PHOTO_BYTES)
    throw new UserError('Each photo must be 10 MB or smaller.');
  if (!sniffClaimPhoto(bytes))
    throw new UserError('That file doesn’t look like a JPG, PNG or HEIC photo.');
  const file = localPath(objectPath);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
}

function localPath(objectPath: string) {
  const full = path.join(LOCAL_DIR, CLAIM_BUCKET, path.normalize(objectPath));
  if (!full.startsWith(path.join(LOCAL_DIR, CLAIM_BUCKET) + path.sep))
    throw new UserError('Invalid photo.');
  return full;
}

/** Reads a stored claim photo. Returns null if it doesn't exist. */
export async function readClaimPhoto(
  objectPath: string,
): Promise<{ bytes: Uint8Array; type: ClaimPhotoType } | null> {
  let bytes: Uint8Array;
  if (env().STORAGE_DRIVER === 'supabase') {
    const { supabaseAdmin } = await import('@/lib/auth/supabase');
    const { data, error } = await supabaseAdmin().storage.from(CLAIM_BUCKET).download(objectPath);
    if (error || !data) return null;
    bytes = new Uint8Array(await data.arrayBuffer());
  } else {
    try {
      const file = localPath(objectPath);
      if ((await stat(file)).size > MAX_CLAIM_PHOTO_BYTES) return null;
      bytes = await readFile(file);
    } catch {
      return null;
    }
  }
  const type = sniffClaimPhoto(bytes);
  return type ? { bytes, type } : null;
}

/**
 * Confirms each uploaded photo exists, is within size and really is a JPG/PNG/HEIC before it is
 * attached to a claim. Anything else is rejected.
 */
export async function verifyClaimPhotos(userId: string, paths: string[], required = true) {
  if (required && paths.length < 1) throw new UserError('Add at least one photo.');
  if (paths.length > MAX_CLAIM_PHOTOS) throw new UserError(`Add up to ${MAX_CLAIM_PHOTOS} photos.`);
  for (const p of paths) {
    if (!claimPhotoBelongsTo(p, userId)) throw new UserError('One of the photos is invalid.');
    const photo = await readClaimPhoto(p);
    if (!photo)
      throw new UserError('One of the photos didn’t upload properly. Please add it again.');
    if (photo.bytes.byteLength > MAX_CLAIM_PHOTO_BYTES)
      throw new UserError('Each photo must be 10 MB or smaller.');
  }
}
