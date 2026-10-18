import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';

export const dynamic = 'force-dynamic';

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="pt-[var(--header-h)]">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
