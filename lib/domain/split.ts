import { computeCartTotals, lineTotalCents } from './cart';
import { commissionCents } from './commission';
import type { CartLine, MakerShipping } from './types';

export interface SplitItem extends CartLine {
  lineTotalCents: number;
  platformCommissionCents: number;
  sellerNetCents: number;
}

export interface FulfilmentPlan {
  makerId: string;
  makerName: string;
  items: SplitItem[];
  subtotalCents: number;
  shippingCents: number;
  platformCommissionCents: number;
  /** Commission rate applied to this maker's items, in basis points (founding makers pay less). */
  feeBps: number;
  /**
   * The maker's share before card processing: items net of commission, plus shipping. The
   * processing fee is deducted once Stripe reports it.
   */
  sellerNetCents: number;
}

export interface OrderPlan {
  fulfilments: FulfilmentPlan[];
  subtotalCents: number;
  shippingTotalCents: number;
  totalCents: number;
  platformFeeTotalCents: number;
}

/**
 * Turns one buyer cart into one buyer-facing order and one fulfilment per maker.
 * Commission applies to item value only; shipping passes through to the maker who ships it.
 * `feeBps` is one rate for everyone, or a rate per maker (founding makers pay less).
 */
export function splitOrder(
  lines: CartLine[],
  shippingByMaker: Map<string, MakerShipping>,
  feeBps: number | ((makerId: string) => number),
): OrderPlan {
  if (lines.length === 0) throw new Error('Cannot create an order from an empty cart');
  const totals = computeCartTotals(lines, shippingByMaker);
  const fulfilments = totals.groups.map<FulfilmentPlan>((group) => {
    const bps = typeof feeBps === 'function' ? feeBps(group.makerId) : feeBps;
    const items = group.lines.map<SplitItem>((line) => {
      const total = lineTotalCents(line);
      const commission = commissionCents(total, bps);
      return {
        ...line,
        lineTotalCents: total,
        platformCommissionCents: commission,
        sellerNetCents: total - commission,
      };
    });
    const platformCommissionCents = items.reduce((s, i) => s + i.platformCommissionCents, 0);
    const itemsNet = items.reduce((s, i) => s + i.sellerNetCents, 0);
    return {
      makerId: group.makerId,
      makerName: group.makerName,
      items,
      subtotalCents: group.subtotalCents,
      shippingCents: group.shippingCents,
      platformCommissionCents,
      feeBps: bps,
      sellerNetCents: itemsNet + group.shippingCents,
    };
  });
  return {
    fulfilments,
    subtotalCents: totals.subtotalCents,
    shippingTotalCents: totals.shippingCents,
    totalCents: totals.totalCents,
    platformFeeTotalCents: fulfilments.reduce((s, f) => s + f.platformCommissionCents, 0),
  };
}
