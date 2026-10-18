export const CURRENCY = 'AUD' as const;

/** Formats integer cents as AUD, e.g. 24900 -> "A$249". Cents shown only when non-zero. */
export function formatPrice(cents: number): string {
  const dollars = cents / 100;
  const hasCents = cents % 100 !== 0;
  return `A$${dollars.toLocaleString('en-AU', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

export function assertCents(value: number, label = 'amount'): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer number of cents`);
  }
  return value;
}
