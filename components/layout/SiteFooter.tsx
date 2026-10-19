import Link from 'next/link';
import { BRAND } from '@/lib/brand';
import { ACKNOWLEDGEMENT } from '@/content/pages/site';
import { SITE } from '@/lib/site/config';
import { NewsletterForm } from './NewsletterForm';

const COLS: Array<{
  title: string;
  links: Array<{ href: string; label: string; external?: boolean }>;
}> = [
  {
    title: 'Shop',
    links: [
      { href: '/?tab=new', label: 'New in' },
      { href: '/collections/made-to-order', label: 'Made to order' },
      { href: '/makers', label: 'Makers' },
    ],
  },
  {
    title: 'Help',
    links: [
      { href: '/how-it-works', label: 'How it works' },
      { href: '/size-guide', label: 'Size guide' },
      { href: '/help', label: 'Help & FAQ' },
      { href: '/help#contact', label: 'Contact' },
    ],
  },
  {
    title: BRAND.name,
    links: [
      { href: '/about', label: 'Our story' },
      { href: '/sell/apply', label: 'Apply to sell' },
      { href: '/legal/terms', label: 'Terms & privacy' },
      { href: SITE.instagram, label: 'Instagram', external: true },
    ],
  },
];

export function SiteFooter() {
  return (
    // Opaque and above the page's hero, so it joins the homepage shutter.
    <div className="relative z-[1] bg-ground pt-24">
      <footer data-site-footer className="border-t border-line">
        <div className="container-page grid grid-cols-2 gap-10 py-14 md:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.6fr)]">
          {COLS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <p className="text-[11px] uppercase tracking-label text-muted-2">{col.title}</p>
              <ul className="mt-4 space-y-3">
                {col.links.map((l) => (
                  <li key={l.href}>
                    {l.external ? (
                      <a
                        href={l.href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] uppercase tracking-label hover:underline hover:underline-offset-[6px]"
                      >
                        {l.label}
                      </a>
                    ) : (
                      <Link
                        href={l.href}
                        className="text-[11px] uppercase tracking-label hover:underline hover:underline-offset-[6px]"
                      >
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
          <div className="col-span-2 md:col-span-1">
            <p className="font-display text-[32px] italic leading-none">Stay connected</p>
            <p className="mt-3 text-[13px] text-muted">First look at new makers and every drop.</p>
            <NewsletterForm />
            <p
              className="mt-6 text-[12px] leading-relaxed text-muted-2"
              data-testid="acknowledgement"
            >
              {ACKNOWLEDGEMENT}
            </p>
          </div>
        </div>
        <div className="container-page flex flex-wrap items-center justify-between gap-3 border-t border-line py-6 text-[12px] text-muted">
          <p>
            © {new Date().getFullYear()} {BRAND.name} · Australian-made, delivered Australia-wide
          </p>
          <p data-testid="footer-abn">{SITE.abn ? `ABN ${SITE.abn}` : 'ABN to come'}</p>
        </div>
      </footer>
    </div>
  );
}
