import { reportError } from '@/lib/log';
import { escalateOverdueClaims } from './claims';
import { shipByReminders, weeklySummaries } from './notifications';
import { holidayTransitions } from './settings';
import { autoMarkDelivered, pollCarrierDeliveries, releaseDueTransfers } from './payouts';

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

/** Weekday in Melbourne for `at`: 'Mon', 'Tue', … */
export function melbourneWeekday(at: Date): string {
  return new Intl.DateTimeFormat('en-AU', {
    weekday: 'short',
    timeZone: 'Australia/Melbourne',
  }).format(at);
}

/**
 * The daily jobs. The cron runs at 21:00 and 22:00 UTC so one run lands on 8am Melbourne in both
 * AEST and AEDT; the morning emails only go out on that run. Each job is idempotent and isolated,
 * so one failure doesn't stop the rest.
 */
export async function runDailyJobs(now: Date) {
  const out: Record<string, unknown> = { melbourneHour: melbourneHour(now) };
  const jobs: Array<[string, () => Promise<unknown>]> = [
    ['escalatedClaims', () => escalateOverdueClaims(now)],
    ['carrierDelivered', () => pollCarrierDeliveries()],
    ['autoDelivered', () => autoMarkDelivered(now)],
    ['transfers', () => releaseDueTransfers(now)],
    ['holidays', () => holidayTransitions(now)],
  ];
  if (melbourneHour(now) === 8) {
    jobs.push(['shipByReminders', () => shipByReminders(now)]);
    if (melbourneWeekday(now) === 'Mon') jobs.push(['weeklySummaries', () => weeklySummaries(now)]);
  }
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
