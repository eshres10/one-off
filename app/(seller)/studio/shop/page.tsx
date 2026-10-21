import { requireSeller } from '@/lib/auth/session';
import { sql } from '@/lib/db';
import { getCustomSettings } from '@/lib/services/custom-studio';
import { listPieces } from '@/lib/services/studio-listings';
import { DesktopRedirect } from '@/components/app/DesktopRedirect';
import { StudioShop } from '@/components/app/studio/Shop';

export const metadata = { title: 'Shop · Studio' };

/** Shop (phones): the shop's pieces and the custom work switch. Desktop goes to Listings. */
export default async function StudioShopPage({ searchParams }: { searchParams: { tab?: string } }) {
  const seller = await requireSeller();
  const [pieces, settings, [shop]] = await Promise.all([
    listPieces(seller),
    getCustomSettings(seller),
    sql()<
      {
        slug: string;
        displayName: string;
        avatarUrl: string | null;
        coverUrl: string | null;
        suburb: string | null;
      }[]
    >`
      select slug, display_name, avatar_url, cover_url,
        nullif(trim(split_part(coalesce(location, city, ''), ',', 1)), '') as suburb
      from public.makers where id = ${seller.makerId}`,
  ]);
  const tab =
    searchParams.tab === 'drafts' ? 'drafts' : searchParams.tab === 'sold' ? 'sold' : 'live';
  return (
    <>
      <DesktopRedirect to="/studio/listings" />
      <div className="md:hidden">
        <StudioShop shop={shop!} pieces={pieces} settings={settings} tab={tab} />
      </div>
    </>
  );
}
