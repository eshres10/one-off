import Link from 'next/link';
import { BRAND } from '@/lib/brand';
import { ReturnsPolicy } from '@/components/ui/ReturnsPolicy';
import { Wordmark } from '@/components/ui/Wordmark';
import { NewsletterForm } from './NewsletterForm';

const COLS = [
  [
    { href: '/?tab=new', label: 'New in' },
    { href: '/collections', label: 'Collections' },
    { href: '/collections/made-to-order', label: 'Made to order' },
    { href: '/makers', label: 'Makers' },
  ],
  [
    { href: '/help/how-it-works', label: 'How it works' },
    { href: '/help/shipping', label: 'Shipping' },
    { href: '/returns', label: 'Returns' },
    { href: '/help/returns-and-fit', label: 'Fit & sizing' },
    { href: '/help/contact', label: 'Contact & help' },
  ],
  [
    { href: '/sell/apply', label: 'Apply to sell' },
    { href: '/help/about', label: 'About' },
    { href: '/help/privacy', label: 'Privacy' },
    { href: '/terms', label: 'Terms' },
  ],
];

export function SiteFooter() {
  return (
    // Opaque and above the page's hero, so it joins the homepage shutter.
    <div className="relative z-[1] bg-ground pt-24">
      <footer data-site-footer className="border-t border-line">
        <div className="container-page grid gap-10 py-14 md:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.6fr)]">
          {COLS.map((col, i) => (
            <ul key={i} className="space-y-3">
              {col.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-[11px] uppercase tracking-label hover:underline hover:underline-offset-[6px]"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          ))}
          <div>
            <p className="font-display text-[32px] italic leading-none">Stay connected</p>
            <p className="mt-3 text-[13px] text-muted">First look at every drop from our makers.</p>
            <NewsletterForm />
            <ReturnsPolicy
              link
              className="mt-6 text-[12px] leading-relaxed text-muted"
              testId="footer-returns"
            />
            <p className="mt-4 text-[12px] leading-relaxed text-muted-2">
              {BRAND.name} acknowledges the Traditional Custodians of the lands on which our makers
              work, and pays respect to Elders past and present.
            </p>
          </div>
        </div>
        <div className="container-page flex flex-wrap items-center justify-between gap-4 border-t border-line py-8">
          <Wordmark size="footer" />
          <p className="text-[11px] uppercase tracking-label text-muted-2">
            © {new Date().getFullYear()} {BRAND.name} · Australian-made, delivered Australia-wide
          </p>
        </div>
      </footer>
    </div>
  );
}
