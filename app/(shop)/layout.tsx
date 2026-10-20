import { AppShell } from '@/components/app/AppShell';
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
    <AppShell modal={modal}>
      {children}
      <QuickViewLinks />
      <CustomerTourGate />
    </AppShell>
  );
}
