import Link from 'next/link';
import { BRAND } from '@/lib/brand';
import { ArrowLeftIcon, LockIcon } from '@/components/ui/icons';
import { Wordmark } from '@/components/ui/Wordmark';

/** Private pages: kept out of search results (they can still use the default share image). */
export const metadata = { robots: { index: false, follow: false } };

export const dynamic = 'force-dynamic';

/** A focused layout for checkout: the wordmark, "Back to bag" and "Secure checkout" only. */
export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ground">
      <header className="border-b border-line bg-ground">
        <div className="mx-auto grid h-[64px] max-w-[1180px] grid-cols-3 items-center px-4 md:px-8">
          <Link
            href="/bag"
            className="flex min-h-[44px] items-center gap-2 text-[11px] uppercase tracking-label"
            data-testid="back-to-bag"
          >
            <ArrowLeftIcon width={16} height={16} />
            <span className="max-sm:sr-only">Back to bag</span>
          </Link>
          <Link href="/" aria-label={`${BRAND.name} home`} className="justify-self-center">
            <Wordmark size="mobile" />
          </Link>
          <p className="flex items-center gap-2 justify-self-end text-[11px] uppercase tracking-label text-muted">
            <LockIcon width={14} height={14} />
            <span className="max-sm:sr-only">Secure checkout</span>
          </p>
        </div>
      </header>
      <main id="main">{children}</main>
    </div>
  );
}
