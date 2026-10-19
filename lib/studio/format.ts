/** Studio dates are Melbourne dates. */
const TZ = 'Australia/Melbourne';

/** YYYY-MM-DD for today (or `offset` days away) in Melbourne. */
export function melbourneToday(offset = 0, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(
    new Date(now.getTime() + offset * 86_400_000),
  );
}

/** Whole days from today (Melbourne) to a YYYY-MM-DD date: 0 today, negative overdue. */
export function daysUntil(date: string | null | undefined, now = new Date()): number | null {
  if (!date) return null;
  const a = Date.parse(`${melbourneToday(0, now)}T00:00:00Z`);
  const b = Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function shipByLabel(date: string | null | undefined, now = new Date()): string {
  const d = daysUntil(date, now);
  if (d === null) return '—';
  if (d < 0) return d === -1 ? '1 day overdue' : `${-d} days overdue`;
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  return dayLabel(date!);
}

/** "Wed 4 Nov" from a YYYY-MM-DD or Date. */
export function dayLabel(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(`${date.slice(0, 10)}T00:00:00Z`) : date;
  return d.toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: typeof date === 'string' ? 'UTC' : TZ,
  });
}

/** "19 Oct" in Melbourne. */
export function shortDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    timeZone: TZ,
  });
}

/** "Good morning" / "Good afternoon" / "Good evening" by Melbourne time. */
export function greeting(now = new Date()): { long: string; short: string } {
  const h = Number(
    new Intl.DateTimeFormat('en-AU', { hour: 'numeric', hourCycle: 'h23', timeZone: TZ }).format(
      now,
    ),
  );
  const part = h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
  return { long: `Good ${part}`, short: part[0]!.toUpperCase() + part.slice(1) };
}

/** "Monday 19 October" in Melbourne. */
export function longDate(now = new Date()): string {
  return now.toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: TZ,
  });
}
