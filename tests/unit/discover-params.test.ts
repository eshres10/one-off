import { describe, expect, it } from 'vitest';
import {
  activePills,
  isNarrowed,
  panelFilterCount,
  parseDiscover,
  toQuery,
} from '@/lib/discover/params';

describe('discover params', () => {
  it('round-trips the URL', () => {
    const p = parseDiscover(
      new URLSearchParams(
        'q=slip&cat=dresses&size=10,12&avail=mto&max=300&colour=navy&sort=popular',
      ),
    );
    expect(p).toMatchObject({
      q: 'slip',
      cat: 'dresses',
      size: ['10', '12'],
      avail: ['mto'],
      max: 300,
      colour: ['navy'],
      sort: 'popular',
    });
    expect(toQuery(p)).toBe(
      'q=slip&cat=dresses&size=10%2C12&avail=mto&max=300&colour=navy&sort=popular',
    );
  });
  it('drops unknown values', () => {
    const p = parseDiscover({
      cat: 'boots',
      size: '10,99',
      max: '9000',
      sort: 'random',
      colour: 'teal',
      edit: 'nope',
    });
    expect(p).toMatchObject({
      cat: 'all',
      size: ['10'],
      max: null,
      sort: 'relevant',
      colour: [],
      edit: null,
    });
  });
  it('counts panel filters and builds removable pills', () => {
    const p = parseDiscover({ size: '10', max: '300' });
    expect(panelFilterCount(p)).toBe(2);
    expect(activePills(p).map((x) => x.label)).toEqual(['Size 10', 'Under A$300']);
    expect(activePills(p)[0]!.without.size).toEqual([]);
    expect(isNarrowed(p)).toBe(true);
    expect(isNarrowed(parseDiscover({}))).toBe(false);
  });
});
