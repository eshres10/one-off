import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { runDailyJobs } from '@/lib/services/daily';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Runs at 21:00 and 22:00 UTC (vercel.json): one of the two is 8am in Melbourne whatever the
 * daylight-saving season. Every job is idempotent, so the second run is harmless; jobs tied to
 * 8am local time only act on the run that lands on it.
 */
export async function GET(req: Request) {
  const secret = env().CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`)
    return new NextResponse(null, { status: 401 });
  return NextResponse.json(await runDailyJobs(new Date()));
}
