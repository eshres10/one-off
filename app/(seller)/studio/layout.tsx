import { requireSeller } from '@/lib/auth/session';
import { getStudioCounts, getStudioShop } from '@/lib/queries/studio';
import { checkoutEnabled } from '@/lib/features';
import { setupProgress } from '@/lib/queries/setup';
import { getLaunch } from '@/lib/site/launch';
import { tourDue } from '@/lib/queries/tour';
import { StudioShell } from '@/components/studio/StudioShell';
import { HelpButton } from '@/components/studio/HelpButton';
import { StudioTour } from '@/components/tour/StudioTour';

/** Private pages: kept out of search results (they can still use the default share image). */
export const metadata = { robots: { index: false, follow: false } };

export const dynamic = 'force-dynamic';

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const seller = await requireSeller();
  const [shop, counts, tour] = await Promise.all([
    getStudioShop(seller.makerId),
    getStudioCounts(seller.makerId),
    tourDue(seller.id, 'studio'),
  ]);
  const setup = shop.shopStatus === 'approved' ? await setupProgress(seller.makerId) : null;
  const launch = (await checkoutEnabled()) ? null : await getLaunch();
  return (
    <StudioShell shop={shop} counts={counts} setup={setup} launch={launch}>
      {children}
      <HelpButton />
      {tour && <StudioTour />}
    </StudioShell>
  );
}
