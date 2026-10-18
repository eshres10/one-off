import { requireSeller } from '@/lib/auth/session';
import { getSellerStats } from '@/lib/queries/seller';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { StatusPill } from '@/components/ui/Badge';
import { countClaimsNeedingAttention } from '@/lib/services/claims';

export const dynamic = 'force-dynamic';

export default async function SellerLayout({ children }: { children: React.ReactNode }) {
  const seller = await requireSeller();
  const [stats, claims] = await Promise.all([
    getSellerStats(seller),
    countClaimsNeedingAttention(seller.makerId),
  ]);
  return (
    <DashboardShell
      title="Seller"
      badge={
        seller.makerStatus !== 'approved' ? (
          <StatusPill status={seller.makerStatus ?? 'draft'} />
        ) : null
      }
      links={[
        { href: '/seller', label: 'Overview' },
        { href: '/seller/orders', label: 'Orders', count: stats.newOrders },
        { href: '/seller/listings', label: 'Listings' },
        { href: '/seller/messages', label: 'Messages', count: stats.unreadThreads },
        { href: '/seller/claims', label: 'Claims', count: claims },
        { href: '/seller/commissions', label: 'Custom requests' },
        { href: '/seller/payouts', label: 'Payouts' },
        { href: '/seller/analytics', label: 'Analytics' },
        { href: '/seller/onboarding', label: 'Profile & settings' },
      ]}
    >
      {children}
    </DashboardShell>
  );
}
