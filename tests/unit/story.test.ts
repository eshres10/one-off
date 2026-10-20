import { describe, expect, it } from 'vitest';
import {
  EMPTY_STORY,
  cleanStory,
  hasStory,
  storyPrompts,
  storySubLine,
  storyTeaser,
} from '@/lib/listings/story';
import { STORY_DETAILS } from '@/lib/listings/storyDetails';

describe('story helpers', () => {
  it('hasStory: any one part counts, including close-ups alone', () => {
    expect(hasStory(EMPTY_STORY)).toBe(false);
    expect(hasStory(null)).toBe(false);
    expect(hasStory({ ...EMPTY_STORY, quote: '   ' })).toBe(false);
    expect(hasStory({ ...EMPTY_STORY, hoursToMake: 3 })).toBe(true);
    expect(hasStory({ ...EMPTY_STORY, details: ['Bias cut'] })).toBe(true);
    expect(hasStory({ ...EMPTY_STORY, closeups: [{ path: '/a.jpg', caption: '' }] })).toBe(true);
  });

  it('counts five prompts on desktop and four on phones; close-ups never count', () => {
    const s = {
      quote: 'Q',
      inspiration: 'I',
      details: ['Bias cut'],
      fabric: 'F',
      hoursToMake: 4,
      closeups: [{ path: '/a.jpg', caption: '' }],
    };
    expect(storyPrompts(s)).toBe(5);
    expect(storyPrompts(s, 'phone')).toBe(4);
    expect(storyPrompts({ ...EMPTY_STORY, closeups: s.closeups })).toBe(0);
  });

  it('the link sub line drops what’s empty', () => {
    expect(
      storySubLine({ ...EMPTY_STORY, inspiration: 'x', details: ['Bias cut'], hoursToMake: 14 }),
    ).toBe('Inspiration, the hand finishes and 14 hours of making');
    expect(storySubLine({ ...EMPTY_STORY, hoursToMake: 9 })).toBe('9 hours of making');
    expect(storySubLine({ ...EMPTY_STORY, inspiration: 'x' })).toBe('Inspiration');
  });

  it('cleans: trims, removes wrapping quotes, de-duplicates chips, enforces limits', () => {
    const s = cleanStory({
      quote: '  “Dance in it.”  ',
      details: ['French seams', 'french seams', '  ', 'x'.repeat(60)],
      hoursToMake: 0,
    });
    expect(s.quote).toBe('Dance in it.');
    expect(s.details).toEqual(['French seams', 'x'.repeat(40)]);
    expect(s.hoursToMake).toBeNull();
    expect(cleanStory({ hoursToMake: 12.6 }).hoursToMake).toBe(13);
  });

  it('shortens the inspiration at a word for phones', () => {
    const long =
      'It started with my nan’s 1970s nightdress, worn so soft the silk felt like water. I spent a winter trying to get that drape right.';
    const t = storyTeaser(long);
    expect(t.length).toBeLessThanOrEqual(121);
    expect(t.endsWith('…')).toBe(true);
    expect(storyTeaser('Short.')).toBe('Short.');
  });

  it('has the ten preset detail chips', () => {
    expect(STORY_DETAILS).toHaveLength(10);
    expect(STORY_DETAILS).toContain('Zero-waste pattern');
  });
});
