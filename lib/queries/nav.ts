import { unstable_cache } from 'next/cache';
import { sql } from '@/lib/db';
import type { MakerLink } from '@/lib/nav/mega';

/**
 * Makers for the mega menu: featured first (topped up by rating when fewer are flagged), and
 * the most recently approved. Cached for a minute; the header renders on every page.
 */
export const getMenuMakers = unstable_cache(
  async (): Promise<{ featured: MakerLink[]; newest: MakerLink[] }> => {
    const featured = await sql()<MakerLink[]>`
      select slug, display_name, cover_url from public.makers where status = 'approved'
      order by is_featured desc, rating desc, review_count desc, display_name limit 5`;
    const newest = await sql()<MakerLink[]>`
      select slug, display_name, cover_url from public.makers where status = 'approved'
      order by approved_at desc nulls last limit 4`;
    return { featured, newest };
  },
  ['menu-makers'],
  { revalidate: 60 },
);
