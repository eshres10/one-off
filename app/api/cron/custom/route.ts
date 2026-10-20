import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { customRequestsTick } from '@/lib/services/custom-cron';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Hourly (vercel.json): the clock on custom requests and quotes. Also runs with the daily jobs. */
export async function GET(req: Request) {
  const secret = env().CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`)
    return new NextResponse(null, { status: 401 });
  return NextResponse.json(await customRequestsTick(new Date()));
}
