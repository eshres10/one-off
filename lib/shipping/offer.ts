import { SITE } from '@/lib/site/config';
import type { MakerRates, Speed, Zone } from './estimate';

/**
 * Shipping offers. Two layers sit on top of each maker's own rates:
 *
 * 1. The maker's deals (maker-funded): free standard shipping over their threshold, or a bundle
 *    deal on 2+ pieces in one parcel. This changes what the maker is paid for shipping.
 * 2. Off One's offer (platform-funded): standard shipping across makers is capped (the first
 *    maker's rate, plus a small amount for each extra maker, never more than the cap) and free
 *    over a cart total. The maker is still paid their full rate; Off One covers the difference.
 *
 * Express parcels are never discounted by either layer. All amounts are integer cents.
 */

export type BundleDeal =
  | { kind: 'none' }
  | { kind: 'free'; minPieces: number }
  | { kind: 'percent'; percentOff: number; minPieces: number };

export const NO_BUNDLE: BundleDeal = { kind: 'none' };

export interface ShippingOffer {
  enabled: boolean;
  /** Added for each maker after the first (standard parcels). */
  extraMakerCents: number;
  /** Standard shipping across the whole order never costs more than this. Null: no cap. */
  capCents: number | null;
  /** Standard shipping is free when the bag's pieces reach this. Null: no threshold. */
  freeOverCents: number | null;
  /** What Off One will cover in a calendar month before the offer pauses. Null: no limit. */
  monthlyBudgetCents: number | null;
}

/**
 * Off until Off One can afford it: the cap and free-shipping threshold are ready to switch on at
 * Admin → Shipping offer. Makers' own bundle deals work either way (they fund those).
 */
export const DEFAULT_SHIPPING_OFFER: ShippingOffer = {
  enabled: false,
  extraMakerCents: 500,
  capCents: 2000,
  freeOverCents: 30000,
  monthlyBudgetCents: 50000,
};

/** Reads a stored offer defensively: anything missing or malformed falls back to the default. */
export function parseShippingOffer(raw: unknown): ShippingOffer {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const cents = (x: unknown, fallback: number | null, max = 10_000_000): number | null => {
    if (x === null) return null;
    const n = Number(x);
    return Number.isInteger(n) && n >= 0 && n <= max ? n : fallback;
  };
  const d = DEFAULT_SHIPPING_OFFER;
  return {
    enabled: typeof v.enabled === 'boolean' ? v.enabled : d.enabled,
    extraMakerCents: cents(v.extraMakerCents, d.extraMakerCents) ?? d.extraMakerCents,
    capCents: 'capCents' in v ? cents(v.capCents, d.capCents) : d.capCents,
    freeOverCents: 'freeOverCents' in v ? cents(v.freeOverCents, d.freeOverCents) : d.freeOverCents,
    monthlyBudgetCents:
      'monthlyBudgetCents' in v
        ? cents(v.monthlyBudgetCents, d.monthlyBudgetCents)
        : d.monthlyBudgetCents,
  };
}

export type MakerDeal = 'free_over' | 'bundle';

export interface MakerParcelPrice {
  /** The maker's normal rate for this parcel, before any deal. */
  listCents: number;
  /** What the maker charges (and is paid) after their own deals. */
  makerCents: number;
  makerDeal: MakerDeal | null;
}

/** One maker's parcel: their rate for the zone and speed, then their free-over or bundle deal. */
export function makerParcelPrice(input: {
  zone: Zone;
  speed: Speed;
  rates?: MakerRates;
  /** The maker's pieces in this order, in cents. */
  makerSubtotalCents: number;
  /** How many pieces are in the parcel. */
  pieces: number;
  bundle?: BundleDeal;
}): MakerParcelPrice {
  const rates = input.rates ?? {};
  const listCents =
    rates[input.zone]?.[input.speed] ?? SITE.shipping.rates[input.zone][input.speed];
  if (input.speed !== 'standard' || listCents === 0)
    return { listCents, makerCents: listCents, makerDeal: null };
  if (rates.freeOverCents && input.makerSubtotalCents >= rates.freeOverCents)
    return { listCents, makerCents: 0, makerDeal: 'free_over' };
  const bundle = input.bundle ?? NO_BUNDLE;
  if (bundle.kind !== 'none' && input.pieces >= bundle.minPieces) {
    const makerCents =
      bundle.kind === 'free' ? 0 : Math.round((listCents * (100 - bundle.percentOff)) / 100);
    return { listCents, makerCents, makerDeal: 'bundle' };
  }
  return { listCents, makerCents: listCents, makerDeal: null };
}

export interface OfferParcel {
  makerId: string;
  speed: Speed;
  listCents: number;
  makerCents: number;
}

export interface OfferResult {
  /** What the buyer pays for each maker's parcel. */
  buyerByMaker: Map<string, number>;
  listTotalCents: number;
  makerTotalCents: number;
  buyerTotalCents: number;
  /** What Off One covers: maker total − buyer total. */
  subsidyCents: number;
  /** What the buyer saves against the makers' normal rates (maker deals + Off One's offer). */
  savingCents: number;
  /** Which of Off One's offers lowered the price, if any. */
  applied: 'cap' | 'free_over' | null;
  /** How much more in pieces gets free shipping (null when there's no threshold or it's met). */
  toFreeCents: number | null;
}

/**
 * Applies Off One's offer to a bag's parcels. Standard parcels: the dearest parcel is paid in
 * full, each other one adds at most `extraMakerCents`, the total never exceeds `capCents`, and
 * it's free once the pieces reach `freeOverCents`. The buyer never pays more than the makers'
 * own prices. The buyer's total is split back across parcels in proportion to each maker's
 * price, so every parcel has a price and the cents always add up.
 */
export function applyShippingOffer(
  parcels: OfferParcel[],
  cartSubtotalCents: number,
  offer: ShippingOffer | null,
): OfferResult {
  const buyerByMaker = new Map<string, number>(parcels.map((p) => [p.makerId, p.makerCents]));
  const listTotalCents = parcels.reduce((s, p) => s + p.listCents, 0);
  const makerTotalCents = parcels.reduce((s, p) => s + p.makerCents, 0);
  const result = (applied: OfferResult['applied'], toFreeCents: number | null): OfferResult => {
    const buyerTotalCents = Array.from(buyerByMaker.values()).reduce((s, c) => s + c, 0);
    return {
      buyerByMaker,
      listTotalCents,
      makerTotalCents,
      buyerTotalCents,
      subsidyCents: makerTotalCents - buyerTotalCents,
      savingCents: Math.max(0, listTotalCents - buyerTotalCents),
      applied,
      toFreeCents,
    };
  };
  if (!offer?.enabled) return result(null, null);

  const standard = parcels
    .filter((p) => p.speed === 'standard' && p.makerCents > 0)
    .sort((a, b) => b.makerCents - a.makerCents || a.makerId.localeCompare(b.makerId));
  const standardTotal = standard.reduce((s, p) => s + p.makerCents, 0);
  const freeOver = offer.freeOverCents;
  const toFreeCents =
    freeOver && cartSubtotalCents < freeOver ? freeOver - cartSubtotalCents : null;
  if (!standard.length) return result(null, toFreeCents);

  let target: number;
  let applied: OfferResult['applied'] = null;
  if (freeOver && cartSubtotalCents >= freeOver) {
    target = 0;
    applied = 'free_over';
  } else {
    target = standard.reduce(
      (s, p, i) => s + (i === 0 ? p.makerCents : Math.min(p.makerCents, offer.extraMakerCents)),
      0,
    );
    if (offer.capCents !== null) target = Math.min(target, offer.capCents);
    target = Math.min(target, standardTotal);
    if (target < standardTotal) applied = 'cap';
  }

  // Split the buyer's standard total across parcels (largest remainder, deterministic).
  const shares = standard.map((p) => {
    const exact = standardTotal ? (target * p.makerCents) / standardTotal : 0;
    return { makerId: p.makerId, cents: Math.floor(exact), rem: exact - Math.floor(exact) };
  });
  let left = target - shares.reduce((s, x) => s + x.cents, 0);
  for (const s of [...shares].sort((a, b) => b.rem - a.rem || a.makerId.localeCompare(b.makerId))) {
    if (left <= 0) break;
    s.cents += 1;
    left -= 1;
  }
  for (const s of shares) buyerByMaker.set(s.makerId, s.cents);
  return result(applied, applied === 'free_over' ? null : toFreeCents);
}

/** "Shipping capped at A$20, however many makers · Free over A$300", for product pages. */
export function offerLine(offer: ShippingOffer | null, format: (cents: number) => string) {
  if (!offer?.enabled) return null;
  const parts: string[] = [];
  if (offer.capCents !== null)
    parts.push(`Shipping capped at ${format(offer.capCents)}, however many makers`);
  if (offer.freeOverCents) parts.push(`free standard shipping over ${format(offer.freeOverCents)}`);
  if (!parts.length) return null;
  const line = parts.join(' · ');
  return line.charAt(0).toUpperCase() + line.slice(1) + '.';
}
