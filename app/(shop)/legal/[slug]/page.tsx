import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LEGAL_DOCS, PLACEHOLDER, getLegalDoc, isLegalSlug, updatedLine } from '@/lib/legal';
import { DocSelect } from '@/components/legal/DocSelect';
import { OnThisPage } from '@/components/legal/OnThisPage';

export const dynamicParams = false;
export function generateStaticParams() {
  return LEGAL_DOCS.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  if (!isLegalSlug(params.slug)) return {};
  const doc = await getLegalDoc(params.slug);
  return {
    title: doc.title,
    description:
      doc.summary.filter((s) => s !== PLACEHOLDER).join(' ') || `${doc.title} for Off One.`,
  };
}

/** One template for every legal document (content/legal/{slug}.mdx). */
export default async function LegalPage({ params }: { params: { slug: string } }) {
  if (!isLegalSlug(params.slug)) notFound();
  const doc = await getLegalDoc(params.slug);
  const toc = doc.sections.map((s) => ({ id: s.id, label: `${s.number}. ${s.heading}` }));
  return (
    <div className="container-page pt-8 md:pt-10" data-testid="legal-page">
      {doc.draft && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 bg-[#8A2E1C] px-4 py-3 text-[13px] text-white md:px-5"
          role="note"
          data-testid="legal-draft-banner"
        >
          <p>
            <strong className="font-medium">Draft layout for legal review.</strong> Wording to be
            written by a lawyer before launch.
          </p>
          <span className="text-[11px] uppercase tracking-label">Template</span>
        </div>
      )}

      <div className="mt-10 grid gap-10 md:grid-cols-[200px_minmax(0,1fr)] lg:grid-cols-[240px_minmax(0,1fr)_240px] lg:gap-16">
        <nav aria-label="Legal documents" className="hidden md:block">
          <ul className="border-t border-ink">
            {LEGAL_DOCS.map((d) => (
              <li key={d.slug} className="border-b border-line">
                <Link
                  href={`/legal/${d.slug}`}
                  aria-current={d.slug === doc.slug ? 'page' : undefined}
                  className={`block py-3 text-[14px] ${d.slug === doc.slug ? 'font-medium text-ink' : 'text-muted hover:text-ink'}`}
                >
                  {d.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <article className="min-w-0">
          <DocSelect docs={LEGAL_DOCS} current={doc.slug} />
          <p className="eyebrow mt-6 md:mt-0">Legal</p>
          <h1 className="mt-3 text-[48px] leading-[0.95] md:text-[72px]">{doc.title}</h1>
          <p className="mt-4 text-[13px] text-muted" data-testid="legal-updated">
            {updatedLine(doc)}
          </p>

          <div className="mt-8 bg-stone px-5 py-5 md:px-7" data-testid="legal-in-short">
            <p className="eyebrow">In short</p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed">
              {doc.summary.map((s) => (
                <li key={s} className={s === PLACEHOLDER ? 'italic text-muted' : ''}>
                  {s}
                </li>
              ))}
            </ul>
          </div>

          {/* Phone: "On this page" folds away. */}
          <details className="mt-6 border-y border-line py-3 lg:hidden">
            <summary className="cursor-pointer text-[11px] uppercase tracking-label">
              On this page
            </summary>
            <ol className="mt-3 space-y-2 text-[13px]">
              {toc.map((t) => (
                <li key={t.id}>
                  <a href={`#${t.id}`} className="text-muted">
                    {t.label}
                  </a>
                </li>
              ))}
            </ol>
          </details>

          {doc.sections.map((s) => (
            <section
              key={s.id}
              id={s.id}
              className="scroll-mt-28 border-t border-line py-8"
              aria-labelledby={`${s.id}-title`}
            >
              <h2 id={`${s.id}-title`} className="text-[30px] leading-tight md:text-[34px]">
                {s.number}. {s.heading}
              </h2>
              {s.covers && <p className="mt-3 text-[15px] text-text2">{s.covers}</p>}
              {s.paragraphs.map((p) =>
                p === PLACEHOLDER ? (
                  <p key={p} className="mt-3 text-[14px] italic text-muted">
                    {p}
                  </p>
                ) : (
                  <p key={p} className="mt-3 text-[15px] leading-relaxed">
                    {p}
                  </p>
                ),
              )}
            </section>
          ))}
        </article>

        <aside className="hidden lg:block">
          <div className="sticky top-[calc(var(--header-offset)+24px)]">
            <p className="eyebrow">On this page</p>
            <div className="mt-4">
              <OnThisPage sections={toc} />
            </div>
            <a
              href={`/legal/${doc.slug}/pdf`}
              className="mt-8 flex min-h-[48px] items-center justify-center border border-ink text-[11px] uppercase tracking-[0.18em] hover:bg-ink hover:text-ground"
              data-testid="legal-pdf"
            >
              Download PDF
            </a>
          </div>
        </aside>
      </div>
      <a
        href={`/legal/${doc.slug}/pdf`}
        className="mt-4 flex min-h-[48px] items-center justify-center border border-ink text-[11px] uppercase tracking-[0.18em] lg:hidden"
      >
        Download PDF
      </a>
    </div>
  );
}
