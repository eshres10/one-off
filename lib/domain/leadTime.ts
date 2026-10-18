import type { ProductType } from './types';

/** Typical Australia Post domestic parcel transit, in business days. */
export const TRANSIT_BUSINESS_DAYS = { min: 2, max: 6 } as const;

function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function addBusinessDays(from: Date, days: number): Date {
  if (!Number.isInteger(days) || days < 0) throw new Error('days must be a non-negative integer');
  const d = startOfUtcDay(from);
  let remaining = days;
  while (isWeekend(d)) d.setUTCDate(d.getUTCDate() + 1);
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (!isWeekend(d)) remaining -= 1;
  }
  return d;
}

export function addCalendarDays(from: Date, days: number): Date {
  const d = startOfUtcDay(from);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export interface LeadTimeInput {
  productType: ProductType;
  /** Production time for made-to-order pieces, in calendar days. */
  leadTimeDays?: number | null;
  /** Maker's handling time for pieces already made, in business days. */
  dispatchDays: number;
}

export interface DeliveryEstimate {
  dispatchBy: Date;
  deliveryFrom: Date;
  deliveryTo: Date;
}

/** Validates the lead-time rules a listing must satisfy. Returns an error message or null. */
export function validateLeadTime(
  productType: ProductType,
  leadTimeDays: number | null | undefined,
): string | null {
  if (productType === 'made_to_order') {
    if (leadTimeDays === null || leadTimeDays === undefined)
      return 'Made-to-order listings need a production lead time.';
    if (!Number.isInteger(leadTimeDays) || leadTimeDays < 1)
      return 'Production lead time must be at least 1 day.';
    if (leadTimeDays > 120) return 'Production lead time must be 120 days or fewer.';
  }
  return null;
}

/**
 * Ready-to-ship and one-of-one pieces dispatch after the maker's handling time; made-to-order
 * pieces dispatch after production (calendar days), rolled to the next business day.
 */
export function estimateDelivery(
  input: LeadTimeInput,
  orderDate: Date = new Date(),
): DeliveryEstimate {
  let dispatchBy: Date;
  if (input.productType === 'made_to_order') {
    const err = validateLeadTime(input.productType, input.leadTimeDays);
    if (err) throw new Error(err);
    dispatchBy = addBusinessDays(addCalendarDays(orderDate, input.leadTimeDays as number), 0);
  } else {
    dispatchBy = addBusinessDays(orderDate, input.dispatchDays);
  }
  return {
    dispatchBy,
    deliveryFrom: addBusinessDays(dispatchBy, TRANSIT_BUSINESS_DAYS.min),
    deliveryTo: addBusinessDays(dispatchBy, TRANSIT_BUSINESS_DAYS.max),
  };
}

/** Whether a piece ordered today is expected (worst case) to arrive by the buyer's date. */
export function arrivesBy(
  input: LeadTimeInput,
  deadline: Date,
  orderDate: Date = new Date(),
): boolean {
  return (
    estimateDelivery(input, orderDate).deliveryTo.getTime() <= startOfUtcDay(deadline).getTime()
  );
}

export function formatDateRange(from: Date, to: Date): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${fmt(from)} – ${fmt(to)}`;
}

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
