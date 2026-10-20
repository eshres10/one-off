import { getSessionUser } from '@/lib/auth/session';
import { sql } from '@/lib/db';
import { getMeasurements } from '@/lib/queries/account';
import { HaveItMade, type SourceListing } from '@/components/custom/HaveItMade';

async function sourceListing(id: string | undefined): Promise<SourceListing | null> {
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [p] = await sql()<SourceListing[]>`
    select p.id, p.slug, p.title, m.display_name as maker,
      (select public_url from public.product_images i where i.product_id = p.id order by i.sort_order limit 1) as image_url
    from public.products p join public.makers m on m.id = p.maker_id where p.id = ${id}`;
  return p ?? null;
}

/**
 * /have-it-made: the guided brief. `source_listing_id` (or `product`) starts from a piece,
 * `q` carries a search the buyer couldn't find, `resume=1` picks the draft up after sign-in.
 */
export default async function HaveItMadePage({
  searchParams,
}: {
  searchParams: { source_listing_id?: string; product?: string; q?: string; resume?: string };
}) {
  const user = await getSessionUser();
  const [source, sizes, [open]] = await Promise.all([
    sourceListing(searchParams.source_listing_id ?? searchParams.product),
    user ? getMeasurements(user) : Promise.resolve(null),
    sql()<{ n: number }[]>`
      select count(*)::int as n from public.maker_custom_settings s join public.makers m on m.id = s.maker_id
      where s.open and m.status = 'approved' and m.shop_status in ('live', 'holiday')`,
  ]);
  const q = typeof searchParams.q === 'string' ? searchParams.q.trim().slice(0, 120) : '';
  return (
    <HaveItMade
      signedIn={Boolean(user)}
      saved={
        sizes
          ? {
              usualSize: sizes.usualSize,
              bust: sizes.bustCm ? Number(sizes.bustCm) : null,
              waist: sizes.waistCm ? Number(sizes.waistCm) : null,
              hips: sizes.hipsCm ? Number(sizes.hipsCm) : null,
            }
          : null
      }
      source={source}
      query={q || null}
      resume={searchParams.resume === '1'}
      makerCount={open?.n ?? 0}
      closeHref={source ? `/products/${source.slug}` : '/'}
    />
  );
}
