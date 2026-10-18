import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { AppTabBar } from '@/components/layout/AppTabBar';

export const dynamic = 'force-dynamic';

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="pt-[var(--header-h)]">
        {children}
      </main>
      <SiteFooter />
      <AppTabBar />
    </>
  );
}
