import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth/session';
import { createClaimUpload } from '@/lib/claim-photos';
import { rateLimit } from '@/lib/rate-limit';
import { isUserFacing } from '@/lib/services/errors';
import { reportError } from '@/lib/log';

const body = z.object({ contentType: z.string(), size: z.number().int().positive() });

/** Prepares a private upload for one claim photo; the browser then sends the file directly. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  try {
    await rateLimit('upload', user.id);
    const upload = await createClaimUpload(user.id, parsed.data.contentType, parsed.data.size);
    return NextResponse.json(upload);
  } catch (err) {
    if (isUserFacing(err)) return NextResponse.json({ error: err.message }, { status: 400 });
    reportError(err, { where: 'claim upload url' });
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 });
  }
}
