import { sql } from '@/lib/db';
import { formatPrice } from '@/lib/domain/money';
import { PIECE_CATEGORIES } from '@/lib/studio/pieces';
import { priceRange } from '@/lib/services/studio-listings';
import type { EditorShop } from '@/lib/studio/pieces';

/** What the piece editor needs to know about the shop (rates, care default, founding…). */
export async function getEditorShop(makerId: string): Promise<EditorShop | null> {
  const [m] = await sql()<
    {
      id: string;
      displayName: string;
      foundingUntil: Date | null;
      careDefault: string | null;
      dispatchDays: number;
      mtoDefaultLead: string | null;
      freeOver: number | null;
      shopStatus: string;
    }[]
  >`
    select id, display_name, founding_until, care_default, dispatch_days, mto_default_lead,
      free_shipping_over_cents as free_over, shop_status
    from public.makers where id = ${makerId}`;
  if (!m) return null;
  const rates = await sql()<
    { region: string; standardCents: number; expressCents: number | null; enabled: boolean }[]
  >`
    select region, standard_cents, express_cents, enabled from public.maker_shipping_rates where maker_id = ${makerId}`;
  const au = rates.find((r) => r.region === 'au' && r.enabled);
  const summary = au
    ? `Standard ${formatPrice(au.standardCents)}${au.expressCents ? ` · Express ${formatPrice(au.expressCents)}` : ''} Australia-wide${m.freeOver ? ` · free over ${formatPrice(m.freeOver)}` : ''}.`
    : 'No shipping prices yet.';
  return {
    makerId: m.id,
    name: m.displayName,
    foundingUntil: m.foundingUntil ? new Date(m.foundingUntil).toISOString() : null,
    careDefault: m.careDefault,
    dispatchDays: m.dispatchDays,
    ratesSummary: summary,
    mtoDefaultLead: m.mtoDefaultLead,
    shopLive: m.shopStatus === 'live' || m.shopStatus === 'holiday',
  };
}

export async function getPriceHints() {
  const entries = await Promise.all(
    PIECE_CATEGORIES.map(async (c) => [c.value, await priceRange(c.value)] as const),
  );
  return Object.fromEntries(entries) as Record<string, { low: number; high: number } | null>;
}
