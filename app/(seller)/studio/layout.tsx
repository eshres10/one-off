import { requireSeller } from '@/lib/auth/session';
import { getStudioCounts, getStudioShop } from '@/lib/queries/studio';
import { StudioShell } from '@/components/studio/StudioShell';

export const dynamic = 'force-dynamic';

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const seller = await requireSeller();
  const [shop, counts] = await Promise.all([
    getStudioShop(seller.makerId),
    getStudioCounts(seller.makerId),
  ]);
  return (
    <StudioShell shop={shop} counts={counts}>
      {children}
    </StudioShell>
  );
}
