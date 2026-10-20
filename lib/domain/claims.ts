import { CLAIM_RESPONSE_BUSINESS_DAYS, RETURNS } from '@/lib/content/returns';

export type ClaimStatus =
  | 'open'
  | 'seller_responded'
  | 'resolved_repair'
  | 'resolved_replace'
  | 'resolved_refund'
  | 'escalated'
  | 'rejected';

export type ClaimProposal = 'repair' | 'replace' | 'refund' | 'alteration';
export type ClaimResolution = 'repair' | 'replace' | 'refund' | 'reject';

const DAY_MS = 24 * 60 * 60 * 1000;
const TZ = 'Australia/Sydney';

/** Weekday (0 = Sunday) of an instant in Sydney time, where makers' business days are counted. */
function sydneyWeekday(d: Date): number {
  const name = new Intl.DateTimeFormat('en-AU', { weekday: 'short', timeZone: TZ }).format(d);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
}

const isWeekend = (d: Date) => {
  const w = sydneyWeekday(d);
  return w === 0 || w === 6;
};

/**
 * Adds business days (Monday–Friday, Sydney time) to an instant, keeping the time of day.
 * A claim made on a weekend starts counting from Monday. Public holidays aren't excluded.
 */
export function addBusinessDays(from: Date, days: number): Date {
  let d = new Date(from.getTime());
  while (isWeekend(d)) d = new Date(d.getTime() + DAY_MS);
  let added = 0;
  while (added < days) {
    d = new Date(d.getTime() + DAY_MS);
    if (!isWeekend(d)) added++;
  }
  return d;
}

export function claimRespondBy(createdAt: Date): Date {
  return addBusinessDays(createdAt, CLAIM_RESPONSE_BUSINESS_DAYS);
}

/**
 * The buyer can use "Report a problem" for `reportWindowDays` after delivery. After that we show
 * "Contact us" instead, since consumer-law rights continue past the window.
 */
export function canReportProblem(deliveredAt: Date | null, now = new Date()): boolean {
  if (!deliveredAt) return false;
  const age = now.getTime() - deliveredAt.getTime();
  return age >= 0 && age <= RETURNS.reportWindowDays * DAY_MS;
}

export const ACTIVE_CLAIM_STATUSES: ClaimStatus[] = ['open', 'seller_responded', 'escalated'];

export function isClaimActive(status: ClaimStatus): boolean {
  return ACTIVE_CLAIM_STATUSES.includes(status);
}

export function isOverdue(claim: { status: ClaimStatus; respondBy: Date }, now = new Date()) {
  return claim.status === 'open' && claim.respondBy.getTime() < now.getTime();
}

/** "1 day 4 hours left to respond" — plain words so screen readers announce it naturally. */
export function responseCountdown(respondBy: Date, now = new Date()): string {
  const ms = respondBy.getTime() - now.getTime();
  if (ms <= 0) return 'Response overdue';
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  const parts = [
    days ? `${days} ${days === 1 ? 'day' : 'days'}` : '',
    rest || !days ? `${rest} ${rest === 1 ? 'hour' : 'hours'}` : '',
  ].filter(Boolean);
  return `${parts.join(' ')} left to respond`;
}

export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  open: 'Waiting for the maker',
  seller_responded: 'Maker responded',
  resolved_repair: 'Resolved — repair',
  resolved_replace: 'Resolved — replacement',
  resolved_refund: 'Resolved — refund',
  escalated: 'With Off One',
  rejected: 'Closed',
};

export const PROPOSAL_LABEL: Record<ClaimProposal, string> = {
  repair: 'Repair it',
  replace: 'Replace it',
  refund: 'Refund it',
  alteration: 'Alter it to the agreed measurements',
};

export function resolutionStatus(r: ClaimResolution): ClaimStatus {
  return r === 'reject' ? 'rejected' : (`resolved_${r}` as ClaimStatus);
}
