import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { checkoutEnabled } from '@/lib/features';

export const dynamic = 'force-dynamic';

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {!checkoutEnabled() && (
        <p
          className="bg-ink px-4 py-2 text-center text-xs text-paper sm:text-sm"
          data-testid="preview-banner"
        >
          Launching soon — explore the makers and save your favourites. Checkout opens at launch.
        </p>
      )}
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
    </>
  );
}
