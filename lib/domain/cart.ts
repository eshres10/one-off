import { assertCents } from './money';
import type { CartLine, MakerShipping } from './types';

export interface MakerGroup {
  makerId: string;
  makerName: string;
  lines: CartLine[];
  subtotalCents: number;
  shippingCents: number;
}

export interface CartTotals {
  groups: MakerGroup[];
  itemCount: number;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
}

/** Shipping for one maker's parcel: flat rate, waived above the maker's free-shipping threshold. */
export function makerShippingCents(
  subtotalCents: number,
  shipping: MakerShipping | undefined,
): number {
  if (subtotalCents === 0) return 0;
  if (!shipping) throw new Error('Missing shipping settings for maker');
  if (shipping.freeShippingOverCents !== null && subtotalCents >= shipping.freeShippingOverCents) {
    return 0;
  }
  return shipping.shippingStandardCents;
}

export function lineTotalCents(line: Pick<CartLine, 'quantity' | 'unitPriceCents'>): number {
  if (!Number.isInteger(line.quantity) || line.quantity < 1)
    throw new Error('quantity must be >= 1');
  assertCents(line.unitPriceCents, 'unitPriceCents');
  return line.quantity * line.unitPriceCents;
}

/** Groups a (possibly multi-maker) cart by maker and computes the full cost before payment. */
export function computeCartTotals(
  lines: CartLine[],
  shippingByMaker: Map<string, MakerShipping>,
): CartTotals {
  const groups = new Map<string, MakerGroup>();
  for (const line of lines) {
    let group = groups.get(line.makerId);
    if (!group) {
      group = {
        makerId: line.makerId,
        makerName: line.makerName,
        lines: [],
        subtotalCents: 0,
        shippingCents: 0,
      };
      groups.set(line.makerId, group);
    }
    group.lines.push(line);
    group.subtotalCents += lineTotalCents(line);
  }
  for (const group of groups.values()) {
    group.shippingCents = makerShippingCents(
      group.subtotalCents,
      shippingByMaker.get(group.makerId),
    );
  }
  const list = [...groups.values()];
  const subtotalCents = list.reduce((s, g) => s + g.subtotalCents, 0);
  const shippingCents = list.reduce((s, g) => s + g.shippingCents, 0);
  return {
    groups: list,
    itemCount: lines.reduce((s, l) => s + l.quantity, 0),
    subtotalCents,
    shippingCents,
    totalCents: subtotalCents + shippingCents,
  };
}
