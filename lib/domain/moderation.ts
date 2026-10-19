/**
 * Message moderation. Buyers and makers may discuss fit, fabric and timing, but contact details
 * and off-platform payment requests are blocked so purchases stay protected by checkout.
 */
export type ModerationReason =
  | 'email'
  | 'phone'
  | 'bank_details'
  | 'external_link'
  | 'off_platform_payment';

export interface ModerationResult {
  allowed: boolean;
  reasons: ModerationReason[];
}

const RULES: Array<{ reason: ModerationReason; patterns: RegExp[] }> = [
  {
    reason: 'email',
    patterns: [
      /[a-z0-9._%+-]+\s*@\s*[a-z0-9.-]+\.[a-z]{2,}/i,
      /\b[a-z0-9._%+-]+\s*(?:\(|\[)?\s*at\s*(?:\)|\])?\s*(?:gmail|hotmail|outlook|yahoo|icloud|bigpond|live|proton(?:mail)?)\s*(?:\(|\[)?\s*(?:dot|\.)/i,
    ],
  },
  {
    reason: 'phone',
    patterns: [
      // AU mobiles / landlines with optional +61, spaces, dots or dashes: 0412 345 678, +61 2 9876 5432
      /(?:\+?\s*61[\s.-]?|\b0)[2-478](?:[\s.-]?\d){8}\b/,
      // Any other run of 8+ digits (allowing separators) is treated as a phone number.
      /\b\d(?:[\s.-]?\d){7,}\b/,
      // Bracketed area codes: (02) 9876 5432
      /\(\s*0[2378]\s*\)[\s.-]?\d{4}[\s.-]?\d{4}\b/,
    ],
  },
  {
    reason: 'bank_details',
    patterns: [
      /\bBSB\b/i,
      /\bbank\b/i,
      /\b(?:acc(?:ount)?|acct)\.?\s*(?:no|num|number|#)\b/i,
      /\b(?:IBAN|SWIFT|routing number)\b/i,
    ],
  },
  {
    reason: 'external_link',
    patterns: [
      /\bhttps?:\/\/\S+/i,
      /\bwww\.\S+/i,
      /\b[a-z0-9-]{2,}\.(?:com|net|org|io|me|co|shop|store|link|ly|app)(?:\.au)?\b(?:\/\S*)?/i,
      /\b[a-z0-9-]{2,}\.com\.au\b/i,
      /\bwa\.me\b/i,
    ],
  },
  {
    reason: 'off_platform_payment',
    patterns: [
      /\b(?:pay\s?id|paypal|venmo|zelle|cash\s?app|revolut|wise\.com|western union|bitcoin|crypto|beem\s?it|osko)\b/i,
      /\b(?:bank|direct)\s+(?:transfer|deposit)\b/i,
      /\bpay\s+(?:me\s+)?(?:directly|outside|off|in cash|cash)\b/i,
      /\b(?:off|outside)[\s-]+(?:the\s+)?(?:platform|site|app|website)\b/i,
      /\b(?:whatsapp|text me|call me|dm me|message me on|telegram|signal me)\b/i,
      /\b(?:avoid|skip|save on)\s+(?:the\s+)?(?:fees?|commission)\b/i,
    ],
  },
];

export function moderateMessage(text: string): ModerationResult {
  const normalised = text.normalize('NFKC');
  const reasons = RULES.filter((rule) => rule.patterns.some((p) => p.test(normalised))).map(
    (r) => r.reason,
  );
  return { allowed: reasons.length === 0, reasons };
}

export const MODERATION_MESSAGES: Record<ModerationReason, string> = {
  email: 'Email addresses can’t be shared in messages.',
  phone: 'Phone numbers can’t be shared in messages.',
  bank_details: 'Bank details can’t be shared in messages.',
  external_link: 'External links can’t be shared in messages.',
  off_platform_payment: 'Payments and contact must stay on the platform.',
};

/** Removes control characters (except newlines/tabs), trims, and collapses runs of blank lines. */
export function sanitizeText(input: string): string {
  return (
    input
      .normalize('NFC')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g, '')
      .replace(/\r\n?/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

/** What the sender sees when a message is blocked (shown inline in the composer). */
export function blockedMessage(sender: 'buyer' | 'maker'): string {
  const base =
    'Contact details, bank details and payment links can’t be sent. Keep it on One Off so you’re covered by buyer protection.';
  return sender === 'maker' ? `${base} Off-platform sales can get your shop paused.` : base;
}
