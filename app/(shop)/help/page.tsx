import type { Metadata } from 'next';
import { FAQ, HELP_PAGE } from '@/content/faq';
import { SITE } from '@/lib/site/config';
import { FaqBrowser } from '@/components/help/FaqBrowser';

export function generateMetadata(): Metadata {
  return { title: HELP_PAGE.meta.title, description: HELP_PAGE.meta.description };
}

/** FAQPage structured data: every question and answer, for search results. */
function faqJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.flatMap((c) =>
      c.items.map((i) => ({
        '@type': 'Question',
        name: i.q,
        acceptedAnswer: { '@type': 'Answer', text: i.a },
      })),
    ),
  };
}

/** Help & FAQ. */
export default function HelpPage() {
  return (
    <div className="pt-14 md:pt-20" data-testid="help-page">
      <script
        type="application/ld+json"
        // JSON.stringify output, with "<" escaped so the copy can never close the script tag.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(faqJsonLd()).replace(/</g, '\\u003c'),
        }}
      />
      <header className="container-page text-center">
        <p className="eyebrow">{HELP_PAGE.kicker}</p>
        <h1 className="mt-4 text-[52px] leading-none md:text-[80px]">{HELP_PAGE.title}</h1>
      </header>
      <FaqBrowser
        categories={FAQ}
        searchPlaceholder={HELP_PAGE.searchPlaceholder}
        contact={HELP_PAGE.contact}
        supportEmail={SITE.supportEmail}
      />
    </div>
  );
}
