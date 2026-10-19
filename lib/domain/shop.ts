/** Whether a shop can take payment right now, and what buyers see when it can't. */
export interface ShopSaleState {
  shopStatus: string;
  chargesEnabled: boolean;
  holidayUntil: Date | string | null;
}

export type Buyable =
  | { ok: true }
  | { ok: false; kind: 'away' | 'coming_soon' | 'closed'; label: string; message: string };

const day = (d: Date | string) =>
  new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function shopBuyable(s: ShopSaleState): Buyable {
  if (s.shopStatus === 'holiday') {
    const until = s.holidayUntil ? `Away until ${day(s.holidayUntil)}` : 'Away for now';
    return {
      ok: false,
      kind: 'away',
      label: until,
      message: `${until}. You can still save pieces and message the maker.`,
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
