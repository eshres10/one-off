import { requireAdmin } from '@/lib/auth/session';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { marketplaceMetrics } from '@/lib/services/admin';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const m = await marketplaceMetrics();
  return (
    <DashboardShell
      title="Admin"
      links={[
        { href: '/admin', label: 'Metrics' },
        { href: '/admin/makers', label: 'Makers', count: m.pendingMakers },
        { href: '/admin/listings', label: 'Listings', count: m.pendingListings },
        { href: '/admin/orders', label: 'Orders & refunds', count: m.openDisputes },
        { href: '/admin/collections', label: 'Collections & homepage' },
        { href: '/admin/commissions', label: 'Commissions' },
        { href: '/admin/moderation', label: 'Moderation', count: m.flaggedMessages },
        { href: '/admin/waitlist', label: 'Waitlist' },
        { href: '/admin/emails', label: 'Emails' },
        { href: '/admin/audit', label: 'Audit log' },
      ]}
    >
      {children}
    </DashboardShell>
  );
}
