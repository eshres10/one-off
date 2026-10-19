import { SITE } from '@/lib/site/config';

/** Whether a shop can take payment right now, and what buyers see when it can't. */
export interface ShopSaleState {
  shopStatus: string;
  chargesEnabled: boolean;
  holidayUntil: Date | string | null;
}

export type Buyable =
  | {
      ok: true;
      /** On holiday but still taking orders: what the banner says. */
      holiday?: { until: string | null; message: string };
    }
  | { ok: false; kind: 'away' | 'coming_soon' | 'closed'; label: string; message: string };

/** The day after the holiday ends, when pieces start shipping again. */
export function shipsFrom(until: Date | string): Date {
  const d = new Date(until);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
}

/** "On holiday until 12 Jan. You can still order. …" */
export function holidayMessage(until: Date | string | null): string {
  if (!until)
    return 'On holiday for now. You can still order. Pieces ship when they’re back, and messages are answered then too.';
  return `On holiday until ${day(until)}. You can still order. Pieces ship from ${day(shipsFrom(until))}, and made-to-order starts then too. Messages are answered when they’re back.`;
}

const day = (d: Date | string) =>
  new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function shopBuyable(
  s: ShopSaleState,
  mode: 'accept_orders' | 'pause_orders' = SITE.holidayMode,
): Buyable {
  if (s.shopStatus === 'holiday') {
    if (mode === 'pause_orders') {
      const back = s.holidayUntil ? `Back ${day(shipsFrom(s.holidayUntil))}` : 'Away for now';
      return {
        ok: false,
        kind: 'away',
        label: back,
        message: `${back}. Follow to hear when they’re open.`,
      };
    }
    if (!s.chargesEnabled)
      return {
        ok: false,
        kind: 'coming_soon',
        label: 'Coming soon',
        message: 'Coming soon: this maker is finishing setting up payments.',
      };
    return {
      ok: true,
      holiday: {
        until: s.holidayUntil ? new Date(s.holidayUntil).toISOString().slice(0, 10) : null,
        message: holidayMessage(s.holidayUntil),
      },
    };
  }
  if (s.shopStatus !== 'live')
    return {
      ok: false,
      kind: 'closed',
      label: 'Not available',
      message: 'This shop isn’t taking orders.',
    };
  if (!s.chargesEnabled)
    return {
      ok: false,
      kind: 'coming_soon',
      label: 'Coming soon',
      message: 'Coming soon: this maker is finishing setting up payments.',
    };
  return { ok: true };
}
