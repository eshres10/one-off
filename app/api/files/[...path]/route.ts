import { readLocalFile } from '@/lib/storage';

/** Serves images uploaded with the local storage driver (development only). */
export async function GET(_req: Request, { params }: { params: { path: string[] } }) {
  const file = await readLocalFile(params.path.join('/'));
  if (!file) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      'Content-Type': file.type,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
}
