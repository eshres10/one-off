import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import { BRAND } from '@/lib/brand';
import './globals.css';

const display = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  axes: ['opsz'],
});
const sans = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });

export const metadata: Metadata = {
  title: {
    default: `${BRAND.name} — Original fashion by independent Australian makers`,
    template: `%s · ${BRAND.name}`,
  },
  description: BRAND.tagline,
  metadataBase: new URL(process.env.APP_URL ?? 'http://localhost:3000'),
};

export const viewport: Viewport = { themeColor: '#FAF8F5', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU" className={`${display.variable} ${sans.variable}`}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
