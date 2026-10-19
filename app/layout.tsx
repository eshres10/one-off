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

export const metadata: Metadata = {
  title: {
    default: `${BRAND.name} — Original fashion by independent Australian makers`,
    template: `%s · ${BRAND.name}`,
  },
  description: BRAND.tagline,
  metadataBase: new URL(process.env.APP_URL ?? 'http://localhost:3000'),
};

export const viewport: Viewport = { themeColor: '#F6F4F0', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU" className={`${display.variable} ${sans.variable}`}>
      <body className="min-h-screen">
        {children}
        <OfflineGate />
      </body>
    </html>
  );
}
