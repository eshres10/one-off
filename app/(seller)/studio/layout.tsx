import { requireSeller } from '@/lib/auth/session';
import { getStudioCounts, getStudioShop } from '@/lib/queries/studio';
import { tourDue } from '@/lib/queries/tour';
import { StudioShell } from '@/components/studio/StudioShell';
import { HelpButton } from '@/components/studio/HelpButton';
import { StudioTour } from '@/components/tour/StudioTour';

export const dynamic = 'force-dynamic';

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const seller = await requireSeller();
  const [shop, counts, tour] = await Promise.all([
    getStudioShop(seller.makerId),
    getStudioCounts(seller.makerId),
    tourDue(seller.id, 'studio'),
  ]);
  return (
    <StudioShell shop={shop} counts={counts}>
      {children}
      <HelpButton />
      {tour && <StudioTour />}
    </StudioShell>
  );
}
