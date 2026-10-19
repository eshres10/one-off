import { describe, expect, it } from 'vitest';
import { waitlistSchema } from '@/lib/services/waitlist';

describe('waitlist validation', () => {
  it('accepts a shopper with just an email, lower-cased', () => {
    const r = waitlistSchema.parse({ email: ' Ava@Example.com ', kind: 'shopper' });
    expect(r).toMatchObject({ email: 'ava@example.com', kind: 'shopper' });
    expect(r.name).toBeUndefined();
  });

  it('requires a label name from makers', () => {
    const r = waitlistSchema.safeParse({ email: 'studio@label.test', kind: 'maker' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['name']);
  });

  it.each([
    ['@Marlowe.Atelier', 'marlowe.atelier'],
    ['marlowe_atelier', 'marlowe_atelier'],
    ['https://www.instagram.com/marlowe.atelier/?hl=en', 'marlowe.atelier'],
    ['', undefined],
  ])('normalises the Instagram handle %s', (input, expected) => {
    const r = waitlistSchema.parse({
      email: 'studio@label.test',
      kind: 'maker',
      name: 'Marlowe',
      instagram: input,
    });
    expect(r.instagram).toBe(expected);
  });

  it('rejects an invalid Instagram handle and an unknown kind', () => {
    expect(
      waitlistSchema.safeParse({
        email: 'a@b.test',
        kind: 'maker',
        name: 'X Label',
        instagram: 'not a handle!',
      }).success,
    ).toBe(false);
    expect(waitlistSchema.safeParse({ email: 'a@b.test', kind: 'admin' }).success).toBe(false);
  });
});
