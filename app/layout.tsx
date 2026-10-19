import { Suspense } from 'react';
import { InstallProvider } from '@/components/install/InstallProvider';
import { RestoreFromLink } from '@/components/install/RestoreFromLink';
import { ServiceWorker } from '@/components/install/ServiceWorker';
import type { Metadata, Viewport } from 'next';
import { Instrument_Serif, Jost } from 'next/font/google';
import { BRAND } from '@/lib/brand';
import './globals.css';
import { OfflineGate } from '@/components/states/OfflineGate';

const display = Instrument_Serif({
  subsets: ['latin'],
  weight: ['400'],
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
});
const sans = Jost({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-sans',
  display: 'swap',
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL || 'http://localhost:3000';
const SHARE_TITLE = `${BRAND.name} — A new marketplace for emerging designers`;
const SHARE_DESCRIPTION =
  'Independent Australian designers who make their own pieces, in small runs or made to order. Australian-made, straight from the maker.';

export const metadata: Metadata = {
  title: { default: SHARE_TITLE, template: `%s · ${BRAND.name}` },
  description: SHARE_DESCRIPTION,
  metadataBase: new URL(SITE_URL),
  applicationName: BRAND.name,
  // Added to an iPhone home screen, it opens like an app.
  appleWebApp: { capable: true, title: BRAND.name, statusBarStyle: 'default' },
  openGraph: {
    type: 'website',
    locale: 'en_AU',
    siteName: BRAND.name,
    title: SHARE_TITLE,
    description: SHARE_DESCRIPTION,
    images: [{ url: '/og-default.jpg', width: 1200, height: 630, alt: BRAND.name }],
  },
  twitter: {
    card: 'summary_large_image',
    title: SHARE_TITLE,
    description: SHARE_DESCRIPTION,
    images: ['/og-default.jpg'],
  },
};

export const viewport: Viewport = { themeColor: '#F6F4F0', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU" className={`${display.variable} ${sans.variable}`}>
      <head>
        {/* Android's install prompt can fire before the app hydrates: keep it for InstallProvider. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__ooInstallPrompt=e;window.dispatchEvent(new Event('oo:installprompt'))});",
          }}
        />
      </head>
      <body className="min-h-screen">
        {children}
        <OfflineGate />
        <ServiceWorker />
        <Suspense fallback={null}>
          <InstallProvider />
          <RestoreFromLink />
        </Suspense>
      </body>
    </html>
  );
}
