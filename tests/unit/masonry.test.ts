import { describe, expect, it } from 'vitest';
import { placeInColumns } from '@/lib/discover/masonry';

describe('placeInColumns', () => {
  it('fills the shortest column, left to right on ties', () => {
    const cols = placeInColumns(['a', 'b', 'c', 'd'], 2, (x) => (x === 'a' ? 2 : 1));
    expect(cols).toEqual([
      ['a', 'd'],
      ['b', 'c'],
    ]);
  });
  it('is stable when more items are appended', () => {
    const h = (n: number) => 1 + (n % 3) * 0.4;
    const first = placeInColumns([1, 2, 3, 4, 5, 6], 3, h);
    const more = placeInColumns([1, 2, 3, 4, 5, 6, 7, 8, 9], 3, h);
    first.forEach((col, i) => expect(more[i]!.slice(0, col.length)).toEqual(col));
  });
});
