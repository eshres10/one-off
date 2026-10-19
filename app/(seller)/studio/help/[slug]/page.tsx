import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSeller } from '@/lib/auth/session';
import { getGuide } from '@/lib/studio/guides';

export default async function GuidePage({ params }: { params: { slug: string } }) {
  await requireSeller();
  const guide = await getGuide(params.slug);
  if (!guide) notFound();
  return (
    <article className="max-w-2xl">
      <Link href="/studio/help" className="text-[11px] uppercase tracking-label text-muted-2">
        ← Guides
      </Link>
      <h1 className="mt-3 text-[40px] leading-none md:text-[56px]">{guide.title}</h1>
      {guide.summary && <p className="mt-3 text-[15px] text-muted">{guide.summary}</p>}
      <div
        className="mt-8 space-y-4 text-[15px] leading-relaxed"
        // Our own guide files, escaped by markdownToHtml.
        dangerouslySetInnerHTML={{ __html: guide.html }}
      />
    </article>
  );
}
