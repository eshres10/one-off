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

/** "Good morning" / "Good afternoon" / "Good evening" in the maker's own time zone. */
export function greeting(now = new Date(), timeZone = TZ): { long: string; short: string } {
  const h = localHour(now, timeZone);
  const part = h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
  return { long: `Good ${part}`, short: part[0]!.toUpperCase() + part.slice(1) };
}

/** "Monday 19 October" in the maker's time zone. */
export function longDate(now = new Date(), timeZone = TZ): string {
  return now.toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone,
  });
}

/** Hour of the day (0–23) in a time zone. */
export function localHour(at: Date, timeZone: string): number {
  return Number(
    new Intl.DateTimeFormat('en-AU', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(at),
  );
}

/** "Wednesday 4 November, 3:00 pm AWST": a due time in the maker's own zone. */
export function timeIn(at: Date, timeZone: string): string {
  return new Date(at).toLocaleString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
    timeZoneName: 'short',
  });
}
