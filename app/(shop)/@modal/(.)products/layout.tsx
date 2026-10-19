import { QuickViewShell } from '@/components/quickview/QuickViewShell';

/** Kept mounted while ←/→ move between pieces, so the frame doesn't flash. */
export default function QuickViewLayout({ children }: { children: React.ReactNode }) {
  return <QuickViewShell>{children}</QuickViewShell>;
}
