import { LEGAL_DOCS, getLegalDoc, isLegalSlug } from '@/lib/legal';
import { legalPdf } from '@/lib/legal-pdf';

export const dynamic = 'force-static';
export const dynamicParams = false;
export function generateStaticParams() {
  return LEGAL_DOCS.map((d) => ({ slug: d.slug }));
}

/** "Download PDF" on a legal page, generated from the same content. */
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  if (!isLegalSlug(params.slug)) return new Response('Not found', { status: 404 });
  const doc = await getLegalDoc(params.slug);
  const bytes = await legalPdf(doc);
  return new Response(Buffer.from(bytes), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="one-off-${doc.slug}.pdf"`,
    },
  });
}
