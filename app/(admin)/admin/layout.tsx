import { requireAdmin } from '@/lib/auth/session';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { marketplaceMetrics } from '@/lib/services/admin';
import { applicationQueue } from '@/lib/services/applications';
import { countClaimsNeedingAttention } from '@/lib/services/claims';

/** Private pages: kept out of search results (they can still use the default share image). */
export const metadata = { robots: { index: false, follow: false } };

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const [m, claims, applications] = await Promise.all([
    marketplaceMetrics(),
    countClaimsNeedingAttention(),
    applicationQueue('applied').then((r) => r.length),
  ]);
  return (
    <DashboardShell
      title="Admin"
      links={[
        { href: '/admin', label: 'Metrics' },
        { href: '/admin/applications', label: 'Applications', count: applications },
        { href: '/admin/shops', label: 'Shops' },
        { href: '/admin/makers', label: 'Makers', count: m.pendingMakers },
        { href: '/admin/listings', label: 'Listings', count: m.pendingListings },
        { href: '/admin/listing-requests', label: 'Photos to list' },
        { href: '/admin/orders', label: 'Orders & refunds', count: m.openDisputes },
        { href: '/admin/claims', label: 'Claims', count: claims },
        { href: '/admin/returns', label: 'Returns' },
        { href: '/admin/collections', label: 'Collections & homepage' },
        { href: '/admin/commissions', label: 'Commissions' },
        { href: '/admin/support', label: 'Maker messages' },
        { href: '/admin/moderation', label: 'Moderation', count: m.flaggedMessages },
        { href: '/admin/waitlist', label: 'Waitlist' },
        { href: '/admin/launch', label: 'Launch' },
        { href: '/admin/emails', label: 'Emails' },
        { href: '/admin/audit', label: 'Audit log' },
      ]}
    >
      {children}
    </DashboardShell>
  );
}
