import { processReturns } from './returns';
import { reportError } from '@/lib/log';
import { SITE } from '@/lib/site/config';
import { applicationsDigest } from './applications';
import { escalateOverdueClaims } from './claims';
import { caseDueReminders, shipByReminders, weeklySummaries } from './notifications';
import { holidayTransitions } from './settings';
import { sendRestockAlerts } from './restock';
import { autoMarkDelivered, pollCarrierDeliveries, releaseDueTransfers } from './payouts';

/** Hour of the day in the admin's time zone (SITE.adminTimeZone) for `at`. */
export function adminHour(at: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-AU', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone: SITE.adminTimeZone,
    }).format(at),
  );
}

/**
 * The daily jobs. The cron runs at 21:00, 22:00, 23:00 and 00:00 UTC, so every Australian zone
 * gets a run at or just after 8am local (Perth's is 00:00 UTC; Adelaide and Darwin land at 8:30).
 * Maker messages (ship-by reminders, Monday summaries, case due reminders) go out at the first
 * run at or after 8am in the maker's own time zone, once each. The admin's applications summary
 * stays on SITE.adminTimeZone. Each job is idempotent and isolated, so one failure doesn't stop
 * the rest. An hourly schedule works too, if the hosting plan allows it.
 */
export async function runDailyJobs(now: Date) {
  const out: Record<string, unknown> = { adminHour: adminHour(now) };
  const jobs: Array<[string, () => Promise<unknown>]> = [
    ['escalatedClaims', () => escalateOverdueClaims(now)],
    ['carrierDelivered', () => pollCarrierDeliveries()],
    ['autoDelivered', () => autoMarkDelivered(now)],
    ['returns', () => processReturns(now)],
    ['transfers', () => releaseDueTransfers(now)],
    ['holidays', () => holidayTransitions(now)],
    ['restockAlerts', () => sendRestockAlerts()],
  ];
  if (adminHour(now) === SITE.adminDigestHour)
    jobs.push(['applicationsDigest', () => applicationsDigest(now)]);
  jobs.push(
    ['shipByReminders', () => shipByReminders(now)],
    ['weeklySummaries', () => weeklySummaries(now)],
    ['caseDueReminders', () => caseDueReminders(now)],
  );
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
