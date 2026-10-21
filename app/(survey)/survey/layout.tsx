import type { Metadata } from 'next';
import { SURVEY_HOME } from '@/lib/survey/host';

const TITLE = 'Off One · Maker survey';
const DESCRIPTION = '5 minutes to help shape a marketplace for Australian makers';

/** Private research page: not indexed, with its own share image. */
export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  robots: { index: false, follow: false },
  openGraph: {
    type: 'website',
    locale: 'en_AU',
    siteName: 'Off One',
    title: TITLE,
    description: DESCRIPTION,
    url: SURVEY_HOME,
    images: [{ url: '/og/survey', width: 1200, height: 630, alt: TITLE }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/og/survey'],
  },
};

export const dynamic = 'force-dynamic';

/** Only the survey: no header, footer, bag or login (the root layout adds fonts and nothing else). */
export default function SurveyLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-ground text-ink">{children}</div>;
}
