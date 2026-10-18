import { assertCents } from './money';

export const DEFAULT_PLATFORM_FEE_BPS = 1500; // 15%

/**
 * Platform commission on a line total, in integer cents. Rounds half up so the platform and
 * maker shares always sum exactly to the line total.
 */
export function commissionCents(
  lineTotalCents: number,
  feeBps: number = DEFAULT_PLATFORM_FEE_BPS,
): number {
  assertCents(lineTotalCents, 'lineTotalCents');
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10_000) {
    throw new Error('feeBps must be an integer between 0 and 10000');
  }
  return Math.floor((lineTotalCents * feeBps + 5_000) / 10_000);
}

export function sellerNetCents(
  lineTotalCents: number,
  feeBps: number = DEFAULT_PLATFORM_FEE_BPS,
): number {
  return lineTotalCents - commissionCents(lineTotalCents, feeBps);
}
