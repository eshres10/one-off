import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { escalateOverdueClaims } from '@/lib/services/claims';

export const dynamic = 'force-dynamic';

/** Daily (vercel.json): escalates claims the maker hasn't answered within 2 business days. */
export async function GET(req: Request) {
  const secret = env().CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`)
    return new NextResponse(null, { status: 401 });
  const escalated = await escalateOverdueClaims();
  return NextResponse.json({ escalated });
}
