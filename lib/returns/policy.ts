import { SITE } from '@/lib/site/config';

/**
 * Off One's returns policy by piece type: the single source for every surface (product page,
 * quick view, bag, checkout, emails, help, legal). Ready-to-ship pieces can be returned for a
 * change of mind within the window; made-to-order, custom and one-of-one pieces can't. Faulty or
 * not-as-described pieces are always covered through "Report a problem" (Australian Consumer Law).
 */
export type ReturnItemType = 'ready_to_ship' | 'made_to_order' | 'one_of_one' | 'custom';

export interface ReturnPolicy {
  type: ReturnItemType;
  changeOfMind: boolean;
  windowDays?: number;
  /** One line: quick view, bag lines, emails. */
  summary: string;
  /** The full sentence for product pages and checkout. */
  detail: string;
}

const FAULTS = 'Faulty or not as described? We’ll make it right.';

const NOUN: Record<Exclude<ReturnItemType, 'ready_to_ship'>, string> = {
  made_to_order: 'made-to-order pieces',
  one_of_one: 'one-of-ones',
  custom: 'custom pieces',
};

export function asReturnType(t: string | null | undefined): ReturnItemType {
  return t === 'made_to_order' || t === 'one_of_one' || t === 'custom' ? t : 'ready_to_ship';
}

export function getReturnPolicy(itemType: string): ReturnPolicy {
  const type = asReturnType(itemType);
  const r = SITE.returns;
  if (type === 'ready_to_ship') {
    const postage =
      r.returnPostagePaidBy === 'buyer' ? 'Return postage is on you.' : 'Return postage is on us.';
    return {
      type,
      changeOfMind: true,
      windowDays: r.readyToShipWindowDays,
      summary: `Return within ${r.readyToShipWindowDays} days of delivery if unworn, with tags.`,
      detail: `Ready to ship: changed your mind? Return it unworn, with tags, within ${r.readyToShipWindowDays} days of delivery for a refund. ${postage} ${FAULTS}`,
    };
  }
  const detail: Record<typeof type, string> = {
    made_to_order: `Made to order: it’s made for you after you buy, so there are no change-of-mind returns. Please check the size guide or ask the maker before ordering. ${FAULTS}`,
    one_of_one: `One of one: only one was ever made, so there are no change-of-mind returns. ${FAULTS}`,
    custom: `Custom: made to your brief, so there are no change-of-mind returns. ${FAULTS}`,
  };
  return {
    type,
    changeOfMind: false,
    summary: `No change-of-mind returns on ${NOUN[type]}.`,
    detail: detail[type],
  };
}

/** What's stored on each order item at checkout, so later policy changes never touch it. */
export interface StoredReturnPolicy {
  type: ReturnItemType;
  changeOfMind: boolean;
  windowDays: number | null;
  summary: string;
}

export function policySnapshot(itemType: string): StoredReturnPolicy {
  const p = getReturnPolicy(itemType);
  return {
    type: p.type,
    changeOfMind: p.changeOfMind,
    windowDays: p.windowDays ?? null,
    summary: p.summary,
  };
}

const DAY_MS = 86_400_000;

/** The last moment a change-of-mind return can be started: delivery plus the window. */
export function returnDeadline(
  deliveredAt: Date,
  windowDays: number = SITE.returns.readyToShipWindowDays,
): Date {
  return new Date(new Date(deliveredAt).getTime() + windowDays * DAY_MS);
}

export interface ReturnableItem {
  /** The policy stored on the order item (falls back to the type's current policy). */
  returnPolicy: StoredReturnPolicy | null;
  productType: string;
  deliveredAt: Date | null;
  /** The item already has a return that isn't cancelled or rejected. */
  hasReturn: boolean;
  /** The item has an open "Report a problem" case. */
  hasOpenCase: boolean;
  /** Refunded in full already. */
  refunded?: boolean;
}

/** Why an item can't be returned, or null when it can. */
export function returnBlocker(item: ReturnableItem, now = new Date()): string | null {
  const policy = item.returnPolicy ?? policySnapshot(item.productType);
  if (!policy.changeOfMind || !policy.windowDays) return 'Not returnable for change of mind.';
  if (!item.deliveredAt) return 'You can start a return once it’s been delivered.';
  if (item.refunded) return 'This piece has already been refunded.';
  if (item.hasReturn) return 'A return has already been started for this piece.';
  if (item.hasOpenCase) return 'There’s an open problem report for this piece.';
  if (now.getTime() > returnDeadline(item.deliveredAt, policy.windowDays).getTime())
    return `The ${policy.windowDays}-day return window has closed.`;
  return null;
}

export function canReturn(item: ReturnableItem, now = new Date()): boolean {
  return returnBlocker(item, now) === null;
}
