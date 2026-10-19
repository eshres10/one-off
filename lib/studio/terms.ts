/**
 * Studio business rules. Every number a maker sees (commission, payout timing, dispatch and
 * making-time options, sizes) comes from here; components never hard-code them.
 */
export const TERMS = {
  standardCommissionPct: 15, // matches PLATFORM_FEE_BPS=1500 and the help and waitlist pages
  foundingCommissionPct: 0,
  foundingMonths: 3, // [CONFIRM]
  foundingSpotsTotal: 20,
  payoutWeekday: 'thursday', // [CONFIRM]
  releaseDaysAfterDelivery: 3, // [CONFIRM]
  autoDeliveredDaysAfterShip: 10, // if no carrier delivery event arrives
  inviteLinkDays: 7,
  /** Applications: how long review usually takes, and how long after a decline to reapply. */
  reviewBusinessDays: 2,
  reapplyAfterDays: 90,
  /** Pieces from a newly approved shop flagged for a light admin spot check. */
  spotCheckPieces: 3,
  applicationPhotos: { min: 3, max: 6 },
  readyToShipDispatchOptions: ['Same day', '1–2 days', '3–5 days'],
  mtoLeadOptions: ['1 week', '2 weeks', '3 weeks', '4 weeks'],
  sizes: ['6', '8', '10', '12', '14', '16', 'Custom'],
} as const;

export type DispatchOption = (typeof TERMS.readyToShipDispatchOptions)[number];
export type MtoLead = (typeof TERMS.mtoLeadOptions)[number];
export type Weekday = typeof TERMS.payoutWeekday;

/** Days to dispatch a ready-to-ship piece, by the maker's chosen option (upper bound). */
export function dispatchDaysFor(option: string | null | undefined): number {
  if (option === 'Same day') return 0;
  if (option === '1–2 days') return 2;
  if (option === '3–5 days') return 5;
  return 3;
}

/** Making time in days for a made-to-order lead option ("2 weeks" → 14). */
export function leadDaysFor(option: string | null | undefined): number {
  const m = /^(\d+)\s*week/.exec(option ?? '');
  return m ? Number(m[1]) * 7 : 14;
}

/** The closest lead option for a number of days (14 → "2 weeks"). */
export function leadOptionFor(days: number | null | undefined): MtoLead {
  const weeks = Math.min(4, Math.max(1, Math.round((days ?? 14) / 7)));
  return TERMS.mtoLeadOptions[weeks - 1]!;
}

/** Commission rate for a sale made now: founding rate while founding, standard after. */
export function commissionPctAt(foundingUntil: Date | string | null | undefined, at = new Date()) {
  return foundingUntil && new Date(foundingUntil).getTime() > at.getTime()
    ? TERMS.foundingCommissionPct
    : TERMS.standardCommissionPct;
}

/** Card processing estimate shown before a sale (the stored fee is Stripe's actual fee). */
export const PROCESSING_ESTIMATE = { pct: 1.75, fixedCents: 30 } as const;

export function processingEstimateCents(totalCents: number): number {
  return Math.round((totalCents * PROCESSING_ESTIMATE.pct) / 100) + PROCESSING_ESTIMATE.fixedCents;
}
