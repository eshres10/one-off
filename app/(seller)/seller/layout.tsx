import { requireSeller } from '@/lib/auth/session';
import { getSellerStats } from '@/lib/queries/seller';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { StatusPill } from '@/components/ui/Badge';

export const dynamic = 'force-dynamic';

export default async function SellerLayout({ children }: { children: React.ReactNode }) {
  const seller = await requireSeller();
  const stats = await getSellerStats(seller);
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
