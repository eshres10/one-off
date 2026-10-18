import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { rateLimit } from '@/lib/rate-limit';
import { isUserFacing } from '@/lib/services/errors';
import { storeImage } from '@/lib/storage';
import { uploadsEnabled } from '@/lib/features';
import { reportError } from '@/lib/log';

const KINDS = ['products', 'messages', 'commissions', 'makers', 'reviews', 'collections'] as const;

/** Authenticated image upload. Validates type by signature and size (8 MB) server-side. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: 'Please sign in to upload images.' }, { status: 401 });
  if (!uploadsEnabled()) {
    return NextResponse.json({ error: 'Photo uploads open at launch.' }, { status: 503 });
  }
  try {
    await rateLimit('upload', user.id);
    const form = await req.formData();
    const kind = String(form.get('kind') ?? 'messages') as (typeof KINDS)[number];
    if (!KINDS.includes(kind))
      return NextResponse.json({ error: 'Unknown upload type.' }, { status: 400 });
    if (
      (kind === 'products' || kind === 'makers') &&
      user.role !== 'seller' &&
      user.role !== 'admin'
    ) {
      return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
    }
    const file = form.get('file');
    if (!(file instanceof File))
      return NextResponse.json({ error: 'Choose an image to upload.' }, { status: 400 });
    if (file.size > 8 * 1024 * 1024)
      return NextResponse.json({ error: 'Images must be 8 MB or smaller.' }, { status: 413 });
    const stored = await storeImage(new Uint8Array(await file.arrayBuffer()), file.type, kind);
    return NextResponse.json({ url: stored.url });
  } catch (err) {
    if (isUserFacing(err)) return NextResponse.json({ error: err.message }, { status: 400 });
    reportError(err, { where: 'upload' });
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 });
  }
}
