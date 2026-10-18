import Link from 'next/link';
import { BRAND } from '@/lib/brand';

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-stone/70 bg-stone-light/50">
      <div className="container-page grid gap-10 py-14 md:grid-cols-4">
        <div className="md:col-span-2">
          <p className="font-display text-2xl">{BRAND.name}</p>
          <p className="mt-3 max-w-sm text-sm text-ink-soft">{BRAND.tagline}</p>
          <p className="mt-6 text-xs text-ink-muted">
            Ships within Australia only. Prices in AUD and include GST where applicable.
          </p>
        </div>
        <div>
          <p className="eyebrow">Shop</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link href="/" className="hover:underline">
                Discover
              </Link>
            </li>
            <li>
              <Link href="/collections" className="hover:underline">
                Collections
              </Link>
            </li>
            <li>
              <Link href="/makers" className="hover:underline">
                Makers
              </Link>
            </li>
            <li>
              <Link href="/custom" className="hover:underline">
                Request a custom piece
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="eyebrow">Help</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link href="/help/buyer-protection" className="hover:underline">
                Buyer protection
              </Link>
            </li>
            <li>
              <Link href="/help/shipping-returns" className="hover:underline">
                Shipping & returns
              </Link>
            </li>
            <li>
              <Link href="/help/selling" className="hover:underline">
                Selling (invite only)
              </Link>
            </li>
            <li>
              <a href={`mailto:${BRAND.supportEmail}`} className="hover:underline">
                Contact us
              </a>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
