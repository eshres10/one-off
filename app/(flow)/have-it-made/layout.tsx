/** Private pages: kept out of search results (they can still use the default share image). */
export const metadata = {
  title: 'Have it made',
  description:
    'Tell us what you’re dreaming of. We match you with Australian makers who can make it, in your size, by your date.',
};

export const dynamic = 'force-dynamic';

/** The guided brief has its own header (back, wordmark, close): no site header or footer. */
export default function FlowLayout({ children }: { children: React.ReactNode }) {
  return <main id="main">{children}</main>;
}
