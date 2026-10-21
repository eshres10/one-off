import { processReturns } from './returns';
import { reportError } from '@/lib/log';
import { SITE } from '@/lib/site/config';
import { applicationsDigest } from './applications';
import { escalateOverdueClaims } from './claims';
import { caseDueReminders, shipByReminders, weeklySummaries } from './notifications';
import { holidayTransitions } from './settings';
import { sendRestockAlerts } from './restock';
import { sendDropAlerts } from './push';
import { autoMarkDelivered, pollCarrierDeliveries, releaseDueTransfers } from './payouts';
import { customRequestsTick } from './custom-cron';

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
 * The daily jobs. The cron runs at 23:00 and 00:00 UTC (vercel.json: Vercel's Hobby plan allows
 * two daily crons), so every Australian zone gets a run at or after 8am local: Perth's is 00:00
 * UTC, the east coast's first is 23:00. Maker messages (ship-by reminders, Monday summaries, case
 * due reminders) go out at the first run at or after 8am in the maker's own time zone, once each.
 * The admin's applications summary goes at the first run at or after SITE.adminDigestHour, once
 * a day. Custom-request deadlines tick here too (the hourly /api/cron/custom needs a Pro plan).
 * Each job is idempotent and isolated, so one failure doesn't stop the rest.
 */
export async function runDailyJobs(now: Date) {
  const out: Record<string, unknown> = { adminHour: adminHour(now) };
  const jobs: Array<[string, () => Promise<unknown>]> = [
    ['escalatedClaims', () => escalateOverdueClaims(now)],
    ['carrierDelivered', () => pollCarrierDeliveries()],
    ['autoDelivered', () => autoMarkDelivered(now)],
    ['returns', () => processReturns(now)],
    ['transfers', () => releaseDueTransfers(now)],
    ['customRequests', () => customRequestsTick(now)],
    ['holidays', () => holidayTransitions(now)],
    ['restockAlerts', () => sendRestockAlerts()],
    ['dropAlerts', () => sendDropAlerts(now)],
  ];
  if (adminHour(now) >= SITE.adminDigestHour)
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
