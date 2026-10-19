import { describe, expect, it } from 'vitest';
import { blockedMessage, moderateMessage, sanitizeText } from '@/lib/domain/moderation';

describe('message moderation', () => {
  it.each([
    'What size should I get? I am 168cm with a 92cm bust.',
    'Can you make this in sage linen instead of silk?',
    'Would it arrive by 14 December for a wedding?',
    'Could you take the hem up 5cm please?',
    'Love it — can you send a video of the back?',
    'My waist is 74 and hips 102, between a 10 and 12.',
  ])('allows normal fit/fabric/timing questions: %s', (text) => {
    expect(moderateMessage(text)).toEqual({ allowed: true, reasons: [] });
  });

  it.each([
    ['email me at jane.doe@gmail.com', 'email'],
    ['jane at gmail dot com', 'email'],
    ['call 0412 345 678', 'phone'],
    ['my number is +61 412 345 678', 'phone'],
    ['ring (02) 9876 5432', 'phone'],
    ['BSB 062-000 acc no 12345678', 'bank_details'],
    ['see https://mystore.example/dress', 'external_link'],
    ['check www.mylabel.com.au', 'external_link'],
    ['order via mylabel.com.au', 'external_link'],
    ['just PayID me and I will post it', 'off_platform_payment'],
    ['I can do it cheaper with a bank transfer', 'off_platform_payment'],
    ['let us do this off the platform to avoid fees', 'off_platform_payment'],
    ['pay me directly and skip the commission', 'off_platform_payment'],
    ['whatsapp me', 'off_platform_payment'],
  ])('blocks "%s" (%s)', (text, reason) => {
    const result = moderateMessage(text);
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain(reason);
  });

  it('sanitises control characters and excess whitespace', () => {
    expect(sanitizeText('  hi\u0000 there\r\n\n\n\nbye‮ ')).toBe('hi there\n\nbye');
  });
});

describe('product-conversation rules', () => {
  it('blocks 8-digit numbers, the word bank and payment links', () => {
    for (const text of ['ring 9876 5432', 'what bank do you use', 'pay at paypal.me/x', 'BSB?'])
      expect(moderateMessage(text).allowed, text).toBe(false);
  });
  it('allows measurements, prices and dates', () => {
    for (const text of [
      'Bust 86, waist 70, hips 95',
      'Is A$310 the final price?',
      'By 12/11/2026?',
    ])
      expect(moderateMessage(text).allowed, text).toBe(true);
  });
  it('words the error for buyers and makers', () => {
    expect(blockedMessage('buyer')).toContain('covered by buyer protection');
    expect(blockedMessage('buyer')).not.toContain('paused');
    expect(blockedMessage('maker')).toContain('Off-platform sales can get your shop paused.');
  });
});
