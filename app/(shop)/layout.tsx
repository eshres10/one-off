import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { AppTabBar } from '@/components/layout/AppTabBar';
import { QuickViewLinks } from '@/components/quickview/QuickViewLinks';
import { CustomerTourGate } from '@/components/tour/CustomerTourGate';

export const dynamic = 'force-dynamic';

export default function ShopLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="pt-[var(--header-h)]">
        {children}
      </main>
      <SiteFooter />
      <AppTabBar />
      {modal}
      <QuickViewLinks />
      <CustomerTourGate />
    </>
  );
}
