import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '@/lib/env';
import { validateImage } from '@/lib/storage';

/**
 * Photos attached to messages live in the private `message-media` bucket (or a directory outside
 * `public/` locally). They're filed under the sender's id and only ever served through
 * /api/messages/media/[...path], which checks the viewer is in a conversation that uses them.
 */
export const MESSAGE_BUCKET = 'message-media';
export const MESSAGE_MEDIA_PREFIX = '/api/messages/media/';

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const LOCAL_DIR = path.join(process.cwd(), '.uploads-private', MESSAGE_BUCKET);

export function isMessageMediaPath(p: string) {
  return /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(p);
}

export async function storeMessagePhoto(
  bytes: Uint8Array,
  declaredType: string,
  userId: string,
): Promise<{ path: string; url: string }> {
  const type = validateImage(bytes, declaredType);
  const objectPath = `${userId}/${randomUUID()}.${EXT[type]}`;
  if (env().STORAGE_DRIVER === 'supabase') {
    const { supabaseAdmin } = await import('@/lib/auth/supabase');
    const { error } = await supabaseAdmin()
      .storage.from(MESSAGE_BUCKET)
      .upload(objectPath, bytes, { contentType: type, upsert: false });
    if (error) throw new Error(`Upload failed: ${error.message}`);
  } else {
    const file = path.join(LOCAL_DIR, objectPath);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
  }
  return { path: objectPath, url: `${MESSAGE_MEDIA_PREFIX}${objectPath}` };
}

export async function readMessagePhoto(
  objectPath: string,
): Promise<{ bytes: Uint8Array; type: string } | null> {
  if (!isMessageMediaPath(objectPath)) return null;
  const ext = objectPath.split('.').pop()!;
  const type = Object.entries(EXT).find(([, e]) => e === ext)?.[0] ?? 'image/jpeg';
  if (env().STORAGE_DRIVER === 'supabase') {
    const { supabaseAdmin } = await import('@/lib/auth/supabase');
    const { data, error } = await supabaseAdmin().storage.from(MESSAGE_BUCKET).download(objectPath);
    if (error || !data) return null;
    return { bytes: new Uint8Array(await data.arrayBuffer()), type };
  }
  try {
    return { bytes: new Uint8Array(await readFile(path.join(LOCAL_DIR, objectPath))), type };
  } catch {
    return null;
  }
}
