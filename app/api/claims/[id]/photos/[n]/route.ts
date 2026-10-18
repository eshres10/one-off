import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { readClaimPhoto } from '@/lib/claim-photos';
import { getClaim } from '@/lib/services/claims';

/** Serves a private claim photo to the buyer, the maker or an admin (RLS decides who). */
export async function GET(_req: Request, { params }: { params: { id: string; n: string } }) {
  const user = await getSessionUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const claim = await getClaim(user, params.id);
  const objectPath = claim?.photos[Number(params.n)];
  if (!objectPath) return new NextResponse(null, { status: 404 });
  const photo = await readClaimPhoto(objectPath);
  if (!photo) return new NextResponse(null, { status: 404 });
  return new NextResponse(Buffer.from(photo.bytes), {
    headers: {
      'Content-Type': photo.type,
      'Cache-Control': 'private, no-store',
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
