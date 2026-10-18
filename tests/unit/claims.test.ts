import { describe, expect, it } from 'vitest';
import {
  addBusinessDays,
  canReportProblem,
  claimRespondBy,
  isOverdue,
  responseCountdown,
} from '@/lib/domain/claims';

// Sydney is UTC+11 in October (daylight saving). 2026-10-19 is a Monday.
const at = (iso: string) => new Date(iso);

describe('addBusinessDays', () => {
  it('counts Monday to Wednesday as two business days', () => {
    expect(addBusinessDays(at('2026-10-19T01:00:00Z'), 2).toISOString()).toBe(
      '2026-10-21T01:00:00.000Z',
    );
  });
  it('skips the weekend', () => {
    // Thursday 22 Oct (Sydney) + 2 business days = Monday 26 Oct.
    expect(addBusinessDays(at('2026-10-22T01:00:00Z'), 2).toISOString()).toBe(
      '2026-10-26T01:00:00.000Z',
    );
  });
  it('starts counting on Monday for a claim made on Saturday', () => {
    // Saturday 24 Oct → Monday 26 Oct, +2 → Wednesday 28 Oct.
    expect(addBusinessDays(at('2026-10-24T01:00:00Z'), 2).toISOString()).toBe(
      '2026-10-28T01:00:00.000Z',
    );
  });
  it('uses Sydney weekdays, not UTC', () => {
    // 2026-10-23T14:00Z is Saturday 1am in Sydney, so counting starts Monday.
    const due = claimRespondBy(at('2026-10-23T14:00:00Z'));
    expect(due.toISOString()).toBe('2026-10-27T14:00:00.000Z');
  });
});

describe('report window', () => {
  const delivered = at('2026-10-10T00:00:00Z');
  it('allows reports for 7 days after delivery', () => {
    expect(canReportProblem(delivered, at('2026-10-17T00:00:00Z'))).toBe(true);
    expect(canReportProblem(delivered, at('2026-10-17T00:00:01Z'))).toBe(false);
  });
  it('needs a delivery date', () => {
    expect(canReportProblem(null)).toBe(false);
  });
});

describe('response deadline', () => {
  it('is overdue only while still open', () => {
    const respondBy = at('2026-10-21T01:00:00Z');
    const later = at('2026-10-21T02:00:00Z');
    expect(isOverdue({ status: 'open', respondBy }, later)).toBe(true);
    expect(isOverdue({ status: 'seller_responded', respondBy }, later)).toBe(false);
  });
  it('describes the time left in words', () => {
    const now = at('2026-10-19T00:00:00Z');
    expect(responseCountdown(at('2026-10-20T04:00:00Z'), now)).toBe(
      '1 day 4 hours left to respond',
    );
    expect(responseCountdown(at('2026-10-19T03:00:00Z'), now)).toBe('3 hours left to respond');
    expect(responseCountdown(at('2026-10-18T03:00:00Z'), now)).toBe('Response overdue');
  });
});
