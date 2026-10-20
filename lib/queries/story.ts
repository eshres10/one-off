import { sql } from '@/lib/db';
import { hasStory, type PieceStory } from '@/lib/listings/story';

export interface StoryForPage {
  story: PieceStory;
  writer: {
    /** The maker's own name, or the shop name. */
    name: string;
    shop: string;
    suburb: string | null;
    avatarUrl: string | null;
    teamSize: number | null;
  };
}

/**
 * The story for a product page. The page has already decided the piece can be shown (live, or a
 * preview for its maker), so this reads directly rather than through RLS.
 */
export async function getProductStory(productId: string): Promise<StoryForPage | null> {
  const [r] = await sql()<
    {
      quote: string | null;
      inspiration: string | null;
      details: string[];
      fabric: string | null;
      hoursToMake: number | null;
      closeups: Array<{ path: string; caption: string }>;
      ownerDisplayName: string | null;
      displayName: string;
      location: string | null;
      city: string | null;
      avatarUrl: string | null;
      teamSize: number | null;
    }[]
  >`
    select s.quote, s.inspiration, s.details, s.fabric, s.hours_to_make, s.closeups,
      m.owner_display_name, m.display_name, m.location, m.city, m.avatar_url, m.team_size
    from public.product_stories s
    join public.products p on p.id = s.product_id
    join public.makers m on m.id = p.maker_id
    where s.product_id = ${productId}`;
  if (!r) return null;
  const story: PieceStory = {
    quote: r.quote ?? '',
    inspiration: r.inspiration ?? '',
    details: r.details ?? [],
    fabric: r.fabric ?? '',
    hoursToMake: r.hoursToMake,
    closeups: r.closeups ?? [],
  };
  if (!hasStory(story)) return null;
  const suburb = (r.location ?? '').split(',')[0]?.trim() || r.city || null;
  return {
    story,
    writer: {
      name: r.ownerDisplayName?.trim() || r.displayName,
      shop: r.displayName,
      suburb,
      avatarUrl: r.avatarUrl,
      teamSize: r.teamSize,
    },
  };
}
