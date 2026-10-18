import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { verifyLocalUploadSignature, writeLocalClaimPhoto } from '@/lib/claim-photos';
import { isUserFacing } from '@/lib/services/errors';

/** Local stand-in for a Supabase signed upload URL (STORAGE_DRIVER=local only). */
export async function PUT(req: Request) {
  if (env().STORAGE_DRIVER !== 'local') return new NextResponse(null, { status: 404 });
  const url = new URL(req.url);
  const objectPath = url.searchParams.get('path') ?? '';
  const sig = url.searchParams.get('sig') ?? '';
  if (!verifyLocalUploadSignature(objectPath, sig))
    return NextResponse.json({ error: 'Invalid upload link.' }, { status: 403 });
  try {
    await writeLocalClaimPhoto(objectPath, new Uint8Array(await req.arrayBuffer()));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (isUserFacing(err)) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
