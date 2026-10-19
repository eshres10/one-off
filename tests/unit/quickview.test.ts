import { describe, expect, it } from 'vitest';
import { compactCount, shortAge } from '@/lib/quickview/format';

describe('quick view helpers', () => {
  it('formats short ages', () => {
    const now = Date.parse('2026-10-19T00:00:00Z');
    expect(shortAge(new Date(now - 30_000), now)).toBe('now');
    expect(shortAge(new Date(now - 5 * 60_000), now)).toBe('5m');
    expect(shortAge(new Date(now - 2 * 86_400_000), now)).toBe('2d');
    expect(shortAge(new Date(now - 21 * 86_400_000), now)).toBe('3w');
  });

  it('compacts save counts', () => {
    expect(compactCount(999)).toBe('999');
    expect(compactCount(1200)).toBe('1.2k');
    expect(compactCount(2000)).toBe('2k');
    expect(compactCount(15400)).toBe('15k');
  });
});
