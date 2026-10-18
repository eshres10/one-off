import { describe, expect, it } from 'vitest';
import {
  addBusinessDays,
  arrivesBy,
  estimateDelivery,
  toIsoDate,
  validateLeadTime,
} from '@/lib/domain/leadTime';

// Wednesday 1 October 2025 (UTC)
const wed = new Date(Date.UTC(2025, 9, 1));

describe('business days', () => {
  it('skips weekends', () => {
    expect(toIsoDate(addBusinessDays(wed, 2))).toBe('2025-10-03'); // Fri
    expect(toIsoDate(addBusinessDays(wed, 3))).toBe('2025-10-06'); // Mon
  });
  it('rolls a weekend start to Monday', () => {
    const sat = new Date(Date.UTC(2025, 9, 4));
    expect(toIsoDate(addBusinessDays(sat, 0))).toBe('2025-10-06');
  });
});

describe('made-to-order lead time', () => {
  it('requires a positive production lead time', () => {
    expect(validateLeadTime('made_to_order', null)).toMatch(/lead time/);
    expect(validateLeadTime('made_to_order', 0)).toMatch(/at least 1/);
    expect(validateLeadTime('made_to_order', 200)).toMatch(/120/);
    expect(validateLeadTime('made_to_order', 21)).toBeNull();
    expect(validateLeadTime('ready_to_ship', null)).toBeNull();
  });

  it('dispatches after production then adds transit', () => {
    const est = estimateDelivery(
      { productType: 'made_to_order', leadTimeDays: 14, dispatchDays: 2 },
      wed,
    );
    expect(toIsoDate(est.dispatchBy)).toBe('2025-10-15');
    expect(toIsoDate(est.deliveryFrom)).toBe('2025-10-17');
    expect(toIsoDate(est.deliveryTo)).toBe('2025-10-23');
  });

  it('ready-to-ship uses maker dispatch days', () => {
    const est = estimateDelivery({ productType: 'ready_to_ship', dispatchDays: 2 }, wed);
    expect(toIsoDate(est.dispatchBy)).toBe('2025-10-03');
    expect(toIsoDate(est.deliveryTo)).toBe('2025-10-13');
  });

  it('rolls production finishing on a weekend to the next business day', () => {
    const est = estimateDelivery(
      { productType: 'made_to_order', leadTimeDays: 3, dispatchDays: 1 },
      wed,
    );
    expect(toIsoDate(est.dispatchBy)).toBe('2025-10-06');
  });

  it('answers "will it arrive by" questions', () => {
    const input = { productType: 'made_to_order' as const, leadTimeDays: 14, dispatchDays: 2 };
    expect(arrivesBy(input, new Date(Date.UTC(2025, 9, 23)), wed)).toBe(true);
    expect(arrivesBy(input, new Date(Date.UTC(2025, 9, 20)), wed)).toBe(false);
  });

  it('throws for made-to-order without lead time', () => {
    expect(() =>
      estimateDelivery({ productType: 'made_to_order', dispatchDays: 1 }, wed),
    ).toThrow();
  });
});
