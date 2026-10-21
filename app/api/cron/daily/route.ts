import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { runDailyJobs } from '@/lib/services/daily';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Runs at 23:00 and 00:00 UTC (vercel.json), so every Australian zone sees a run after 8am local
 * whatever the daylight-saving season. Every job is idempotent, so the extra runs are harmless;
 * jobs tied to a local hour only act on the run that lands on it.
 */
export async function GET(req: Request) {
  const secret = env().CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`)
    return new NextResponse(null, { status: 401 });
  return NextResponse.json(await runDailyJobs(new Date()));
}
