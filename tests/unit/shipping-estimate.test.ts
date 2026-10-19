import { describe, expect, it } from 'vitest';
import {
  estimateArrival,
  formatArrival,
  rateFor,
  stateFromPostcode,
  zoneFor,
} from '@/lib/shipping/estimate';

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

describe('postcodes and zones', () => {
  it('maps postcodes to states', () => {
    expect(stateFromPostcode('3065')).toBe('VIC');
    expect(stateFromPostcode('6160')).toBe('WA');
    expect(stateFromPostcode('2600')).toBe('ACT');
    expect(stateFromPostcode('2000')).toBe('NSW');
    expect(stateFromPostcode('0800')).toBe('NT');
    expect(stateFromPostcode('7000')).toBe('TAS');
    expect(stateFromPostcode('4000')).toBe('QLD');
    expect(stateFromPostcode('5000')).toBe('SA');
    expect(stateFromPostcode('abc')).toBeNull();
  });

  it('a VIC buyer with a VIC maker is same state; with a WA maker, interstate', () => {
    expect(zoneFor('VIC', 'VIC')).toBe('sameState');
    expect(zoneFor('WA', 'VIC')).toBe('interstate');
    expect(zoneFor('VIC', null)).toBe('interstate');
  });
});

describe('delivery prices', () => {
  it('uses the defaults, the maker’s own prices, and free delivery over the threshold', () => {
    expect(rateFor('sameState', 'standard')).toBe(1000);
    expect(rateFor('sameState', 'express')).toBe(1400);
    expect(rateFor('interstate', 'standard')).toBe(1200);
    expect(rateFor('interstate', 'express')).toBe(1500);
    expect(
      rateFor('interstate', 'standard', { interstate: { standard: 900, express: null } }),
    ).toBe(900);
    expect(rateFor('interstate', 'express', { interstate: { standard: 900, express: null } })).toBe(
      1500,
    );
    expect(rateFor('sameState', 'standard', { freeOverCents: 30000 }, 31000)).toBe(0);
    expect(rateFor('sameState', 'express', { freeOverCents: 30000 }, 31000)).toBe(1400);
  });
});

describe('arrival dates', () => {
  it('skips weekends: ordered Friday, 2 handling days, interstate', () => {
    // Fri 6 Nov 2026 → dispatch Tue 10 Nov → 2–5 business days: Thu 12 – Tue 17 Nov.
    const a = estimateArrival(
      { productType: 'ready_to_ship', dispatchDays: 2, zone: 'interstate', speed: 'standard' },
      day('2026-11-06'),
    );
    expect(iso(a.dispatch)).toBe('2026-11-10');
    expect(iso(a.from)).toBe('2026-11-12');
    expect(iso(a.to)).toBe('2026-11-17');
  });

  it('same state is faster, and express takes a day off', () => {
    const base = {
      productType: 'ready_to_ship' as const,
      dispatchDays: 1,
      zone: 'sameState' as const,
    };
    // Mon 9 Nov → dispatch Tue 10 → 1–3 business days: Wed 11 – Fri 13 (express Thu 12).
    const std = estimateArrival({ ...base, speed: 'standard' }, day('2026-11-09'));
    const exp = estimateArrival({ ...base, speed: 'express' }, day('2026-11-09'));
    expect(iso(std.dispatch)).toBe('2026-11-10');
    expect(iso(std.from)).toBe('2026-11-11');
    expect(iso(std.to)).toBe('2026-11-13');
    expect(iso(exp.to)).toBe('2026-11-12');
  });

  it('made to order dispatches after the making time, on a business day', () => {
    // Mon 2 Nov + 14 days = Mon 16 Nov.
    const a = estimateArrival(
      {
        productType: 'made_to_order',
        leadTimeDays: 14,
        dispatchDays: 2,
        zone: 'sameState',
        speed: 'standard',
      },
      day('2026-11-02'),
    );
    expect(iso(a.dispatch)).toBe('2026-11-16');
    // 13 days lands on Sunday 15 Nov: rolled to Monday.
    const b = estimateArrival(
      {
        productType: 'made_to_order',
        leadTimeDays: 13,
        dispatchDays: 2,
        zone: 'sameState',
        speed: 'standard',
      },
      day('2026-11-02'),
    );
    expect(iso(b.dispatch)).toBe('2026-11-16');
  });

  it('formats ranges', () => {
    expect(formatArrival(day('2026-11-04'), day('2026-11-06'))).toBe('Wed 4 – Fri 6 Nov');
    expect(formatArrival(day('2026-11-27'), day('2026-12-02'))).toBe('Fri 27 Nov – Wed 2 Dec');
  });
});
