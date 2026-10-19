import { reportError } from '@/lib/log';
import { escalateOverdueClaims } from './claims';
import { autoMarkDelivered, releaseDueTransfers } from './payouts';

/** Hour of the day in Melbourne for `at`. */
export function melbourneHour(at: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-AU', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone: 'Australia/Melbourne',
    }).format(at),
  );
}

/** The daily jobs. Each one is idempotent and isolated, so one failure doesn't stop the rest. */
export async function runDailyJobs(now: Date) {
  const out: Record<string, unknown> = { melbourneHour: melbourneHour(now) };
  const jobs: Array<[string, () => Promise<unknown>]> = [
    ['escalatedClaims', () => escalateOverdueClaims(now)],
    ['autoDelivered', () => autoMarkDelivered(now)],
    ['transfers', () => releaseDueTransfers(now)],
  ];
  for (const [name, job] of jobs) {
    try {
      out[name] = await job();
    } catch (err) {
      reportError(err, { where: `cron:${name}` });
      out[name] = { error: err instanceof Error ? err.message : String(err) };
    }
  }
  return out;
}
