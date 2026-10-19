import { addBusinessDays, addCalendarDays } from '@/lib/domain/leadTime';
import type { ProductType } from '@/lib/domain/types';
import { SITE, type MakerRegion } from '@/lib/site/config';

export type Zone = 'sameState' | 'interstate';
export type Speed = 'standard' | 'express';

/** The state an Australian postcode belongs to (Australia Post ranges), or null. */
export function stateFromPostcode(postcode: string | null | undefined): MakerRegion | null {
  const n = Number((postcode ?? '').trim());
  if (!/^\d{4}$/.test((postcode ?? '').trim())) return null;
  if ((n >= 200 && n <= 299) || (n >= 2600 && n <= 2618) || (n >= 2900 && n <= 2920)) return 'ACT';
  if (n >= 800 && n <= 999) return 'NT';
  if (n >= 1000 && n <= 2999) return 'NSW';
  if ((n >= 3000 && n <= 3999) || (n >= 8000 && n <= 8999)) return 'VIC';
  if ((n >= 4000 && n <= 4999) || (n >= 9000 && n <= 9999)) return 'QLD';
  if (n >= 5000 && n <= 5999) return 'SA';
  if (n >= 6000 && n <= 6999) return 'WA';
  if (n >= 7000 && n <= 7999) return 'TAS';
  return null;
}

/** Same state or interstate. An unknown buyer state counts as interstate (the "from" price). */
export function zoneFor(
  makerState: string | null | undefined,
  buyerState: string | null | undefined,
): Zone {
  return makerState && buyerState && makerState.toUpperCase() === buyerState.toUpperCase()
    ? 'sameState'
    : 'interstate';
}

/** A maker's own prices (from Shop settings); missing values fall back to SITE.shipping. */
export interface MakerRates {
  sameState?: { standard: number | null; express: number | null } | null;
  interstate?: { standard: number | null; express: number | null } | null;
  /** Free standard delivery when the maker's part of the order reaches this (cents). */
  freeOverCents?: number | null;
}

export function rateFor(
  zone: Zone,
  speed: Speed,
  rates: MakerRates = {},
  makerSubtotalCents = 0,
): number {
  const own = rates[zone]?.[speed];
  const price = own ?? SITE.shipping.rates[zone][speed];
  if (speed === 'standard' && rates.freeOverCents && makerSubtotalCents >= rates.freeOverCents)
    return 0;
  return price;
}

export interface ArrivalInput {
  productType: ProductType;
  /** Made to order: making time in calendar days. */
  leadTimeDays?: number | null;
  /** Ready to ship and one of one: the maker's handling time in business days. */
  dispatchDays: number;
  zone: Zone;
  speed: Speed;
}

export interface Arrival {
  dispatch: Date;
  from: Date;
  to: Date;
}

/**
 * When a parcel arrives: dispatch is today plus the handling days (or plus the making time for
 * made to order, rolled to a business day), then 1–3 business days in the same state or 2–5
 * interstate. Express takes a day off the later end. Weekends (and public holidays) don't count.
 */
export function estimateArrival(input: ArrivalInput, now: Date = new Date()): Arrival {
  const dispatch =
    input.productType === 'made_to_order'
      ? addBusinessDays(addCalendarDays(now, Math.max(1, input.leadTimeDays ?? 14)), 0)
      : addBusinessDays(now, Math.max(0, input.dispatchDays));
  const [min, max] = SITE.shipping.transitBusinessDays[input.zone];
  const save = input.speed === 'express' ? SITE.shipping.expressSavesBusinessDays : 0;
  const latest = Math.max(min, max - save);
  return {
    dispatch,
    from: addBusinessDays(dispatch, min),
    to: addBusinessDays(dispatch, latest),
  };
}

/** The latest of several arrivals (a parcel with several pieces arrives with the slowest). */
export function latestArrival(arrivals: Arrival[]): Arrival {
  return arrivals.reduce((a, b) => (b.to > a.to ? b : a));
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabel = (d: Date, month: boolean) =>
  `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}${month ? ` ${MONTHS[d.getUTCMonth()]}` : ''}`;

/** "Wed 4 – Fri 6 Nov", "Fri 27 Nov – Wed 2 Dec" or "Wed 4 Nov". */
export function formatArrival(from: Date, to: Date): string {
  if (from.getTime() === to.getTime()) return dayLabel(to, true);
  const sameMonth = from.getUTCMonth() === to.getUTCMonth();
  return `${dayLabel(from, !sameMonth)} – ${dayLabel(to, true)}`;
}
