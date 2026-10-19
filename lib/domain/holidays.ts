/**
 * Australian public holidays that pause dispatch: national days plus Victoria's (makers are
 * Melbourne-based), with weekend substitutes. Extend the list each year. The AFL Grand Final
 * eve is set by the state government once the fixture is known; dates after 2025 are expected
 * dates — confirm them when announced.
 */
const DATES = [
  // 2025
  '2025-01-01',
  '2025-01-27',
  '2025-03-10',
  '2025-04-18',
  '2025-04-21',
  '2025-04-25',
  '2025-06-09',
  '2025-09-26',
  '2025-11-04',
  '2025-12-25',
  '2025-12-26',
  // 2026
  '2026-01-01',
  '2026-01-26',
  '2026-03-09',
  '2026-04-03',
  '2026-04-06',
  '2026-06-08',
  '2026-09-25',
  '2026-11-03',
  '2026-12-25',
  '2026-12-28',
  // 2027
  '2027-01-01',
  '2027-01-26',
  '2027-03-08',
  '2027-03-26',
  '2027-03-29',
  '2027-06-14',
  '2027-09-24',
  '2027-11-02',
  '2027-12-27',
  '2027-12-28',
  // 2028
  '2028-01-03',
  '2028-01-26',
  '2028-03-13',
  '2028-04-14',
  '2028-04-17',
  '2028-04-25',
  '2028-06-12',
  '2028-09-29',
  '2028-11-07',
  '2028-12-25',
  '2028-12-26',
];

export const AU_PUBLIC_HOLIDAYS: ReadonlySet<string> = new Set(DATES);

/** True for a UTC calendar date that is an Australian (VIC) public holiday. */
export function isPublicHoliday(d: Date): boolean {
  return AU_PUBLIC_HOLIDAYS.has(d.toISOString().slice(0, 10));
}
