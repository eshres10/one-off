import Link from 'next/link';
import { requireSeller } from '@/lib/auth/session';
import { sql } from '@/lib/db';
import { getSellerStats } from '@/lib/queries/seller';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { StatusPill } from '@/components/ui/Badge';
import { Img as Image } from '@/components/ui/Img';
import { countClaimsNeedingAttention } from '@/lib/services/claims';

export const dynamic = 'force-dynamic';

export default async function SellerLayout({ children }: { children: React.ReactNode }) {
  const seller = await requireSeller();
  const [stats, claims, [maker]] = await Promise.all([
    getSellerStats(seller),
    countClaimsNeedingAttention(seller.makerId),
    sql()<{ slug: string; displayName: string; avatarUrl: string | null }[]>`
      select slug, display_name, avatar_url from public.makers where id = ${seller.makerId}`,
  ]);
  return (
    <DashboardShell
      title="Studio"
      badge={
        seller.makerStatus !== 'approved' ? (
          <StatusPill status={seller.makerStatus ?? 'draft'} />
        ) : null
      }
      right={
        maker && (
          <>
            <Link
              href={`/makers/${maker.slug}`}
              className="hidden min-h-[44px] items-center text-[11px] uppercase tracking-label underline underline-offset-[6px] sm:flex"
            >
              View shop ↗
            </Link>
            <span className="hidden items-center gap-2 text-[12px] md:flex">
              <span className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-circle bg-ground/20 text-[11px]">
                {maker.avatarUrl ? (
                  <Image src={maker.avatarUrl} alt="" fill sizes="32px" className="object-cover" />
                ) : (
                  maker.displayName.slice(0, 2).toUpperCase()
                )}
              </span>
              {maker.displayName}
            </span>
          </>
        )
      }
      links={[
        { href: '/seller/orders', label: 'Orders', count: stats.newOrders },
        { href: '/seller/listings', label: 'Listings' },
        { href: '/seller/messages', label: 'Messages', count: stats.needsReply },
        { href: '/seller/payouts', label: 'Payouts' },
        { href: '/seller/reviews', label: 'Reviews' },
      ]}
      secondary={[
        { href: '/seller', label: 'Overview' },
        { href: '/seller/claims', label: 'Claims', count: claims },
        { href: '/seller/commissions', label: 'Custom requests' },
        { href: '/seller/analytics', label: 'Analytics' },
        { href: '/seller/onboarding', label: 'Settings' },
      ]}
      mobileTabs={[
        { href: '/seller/orders', label: 'Orders', count: stats.newOrders },
        { href: '/seller/listings', label: 'Listings' },
        { href: '/seller/messages', label: 'Messages', count: stats.needsReply },
        { href: '/seller/payouts', label: 'Payouts' },
      ]}
    >
      {children}
    </DashboardShell>
  );
}
