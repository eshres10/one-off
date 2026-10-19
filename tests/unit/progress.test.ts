import { describe, expect, it } from 'vitest';
import { makingDay, progressSteps, stageOf, type ShipmentFacts } from '@/lib/account/progress';

const base: ShipmentFacts = {
  status: 'paid',
  isMto: false,
  makerName: 'Halde Studio',
  orderedAt: new Date('2026-11-02T00:00:00Z'),
  shippedAt: null,
  deliveredAt: null,
  estDispatch: new Date('2026-11-04T00:00:00Z'),
  estFrom: new Date('2026-11-06T00:00:00Z'),
  estTo: new Date('2026-11-10T00:00:00Z'),
  carrier: null,
  leadDays: null,
};

describe('parcel progress', () => {
  it('maps statuses to stages', () => {
    expect(stageOf('paid', false)).toBe('ordered');
    expect(stageOf('ready', false)).toBe('packed');
    expect(stageOf('ready', true)).toBe('making');
    expect(stageOf('shipped', true)).toBe('on_its_way');
    expect(stageOf('completed', false)).toBe('delivered');
  });

  it('shows Packed for ready to ship and Being made (day n of lead) for made to order', () => {
    expect(progressSteps(base).map((s) => s.label)).toEqual([
      'Ordered',
      'Packed',
      'On its way',
      'Delivered',
    ]);
    const mto = progressSteps(
      { ...base, isMto: true, status: 'making', leadDays: 14 },
      new Date('2026-11-09T12:00:00Z'),
    );
    expect(mto.map((s) => s.label)).toEqual(['Ordered', 'Being made', 'On its way', 'Delivered']);
    expect(mto[1]).toMatchObject({ current: true, detail: 'Day 8 of 14' });
    expect(mto[3]!.detail).toBe('Est. Fri 6 – Tue 10 Nov');
  });

  it('counts making days and never runs past the lead time', () => {
    expect(makingDay(new Date('2026-11-02'), 14, new Date('2026-11-02T10:00:00Z'))).toBe(
      'Day 1 of 14',
    );
    expect(makingDay(new Date('2026-11-02'), 14, new Date('2026-12-30'))).toBe('Day 14 of 14');
  });
});

describe('reported problems', () => {
  it('keeps a reported parcel at Delivered with its own note', async () => {
    const { humanNote } = await import('@/lib/account/progress');
    const f = { ...base, status: 'issue', deliveredAt: new Date('2026-11-09T00:00:00Z') };
    expect(stageOf('issue', false)).toBe('delivered');
    expect(progressSteps(f).find((s) => s.current)?.key).toBe('delivered');
    expect(humanNote(f)).toMatch(/reported a problem/);
  });
});
