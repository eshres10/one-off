import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { imageSize, sizeFromUrl } from '@/lib/image-size';

describe('imageSize', () => {
  it('reads JPEG dimensions', () => {
    expect(imageSize(new Uint8Array(readFileSync('public/seed/navy-satin-slip.jpg')))).toEqual({
      width: 933,
      height: 1400,
    });
  });
  it('reads PNG dimensions', () => {
    expect(imageSize(new Uint8Array(readFileSync('public/seed/grain-glass.png')))).toEqual({
      width: 128,
      height: 128,
    });
  });
  it('returns null for other data', () => {
    expect(imageSize(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });
  it('parses sizes from upload names', () => {
    expect(sizeFromUrl('/api/files/products/2026-10/ab-1200x1600.jpg')).toEqual({
      width: 1200,
      height: 1600,
    });
    expect(sizeFromUrl('/seed/x.jpg')).toBeNull();
  });
});
