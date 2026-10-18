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
  /** Amount transferred to the maker's connected account: items net of commission + shipping. */
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
 */
export function splitOrder(
  lines: CartLine[],
  shippingByMaker: Map<string, MakerShipping>,
  feeBps: number,
): OrderPlan {
  if (lines.length === 0) throw new Error('Cannot create an order from an empty cart');
  const totals = computeCartTotals(lines, shippingByMaker);
  const fulfilments = totals.groups.map<FulfilmentPlan>((group) => {
    const items = group.lines.map<SplitItem>((line) => {
      const total = lineTotalCents(line);
      const commission = commissionCents(total, feeBps);
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
