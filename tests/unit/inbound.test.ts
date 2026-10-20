import { describe, expect, it } from 'vitest';
import { findTracking, replyBody, tokenFrom } from '@/lib/services/inbound';
import { toE164 } from '@/lib/sms/send';

describe('tracking numbers in a maker’s reply', () => {
  it('finds an Australia Post number', () => {
    expect(findTracking('Posted this morning: 33ABC1234567 thanks!')).toEqual({
      carrier: 'auspost',
      tracking: '33ABC1234567',
    });
  });

  it('reads Sendle when they say so', () => {
    expect(findTracking('Sent with Sendle, ref SNXV6R2')).toEqual({
      carrier: 'sendle',
      tracking: 'SNXV6R2',
    });
  });

  it('ignores the quoted email, signatures, phone numbers and order numbers', () => {
    const text = [
      'Will post tomorrow, sorry!',
      '--',
      'Halde · 0412345678',
      'On Mon, 19 Oct 2026, Off One wrote:',
      '> You made a sale · OO-1041 33ABC1234567',
    ].join('\n');
    expect(replyBody(text)).toBe('Will post tomorrow, sorry!');
    expect(findTracking(text)).toBeNull();
    expect(findTracking('Order OO1041, mobile 0412345678')).toBeNull();
  });

  it('reads the order token from the reply-to address', () => {
    expect(tokenFrom('Off One <orders+Ab3_x-9Q@reply.shoponeoff.com.au>')).toBe('Ab3_x-9Q');
    expect(tokenFrom('hello@shoponeoff.com.au')).toBeNull();
  });
});

describe('mobile numbers for texts', () => {
  it('normalises Australian mobiles', () => {
    expect(toE164('0412 345 678')).toBe('+61412345678');
    expect(toE164('+61 412 345 678')).toBe('+61412345678');
    expect(toE164('03 9123 4567')).toBeNull();
    expect(toE164('')).toBeNull();
  });
});
