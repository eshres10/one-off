import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getMaker } from '@/lib/queries/catalog';
import { StartThreadForm } from '@/components/messaging/StartThreadForm';
import { responseTimeLabel } from '@/components/maker/MakerByline';

export const metadata = { title: 'Ask a question' };

export default async function AskMakerGeneralPage({ params }: { params: { slug: string } }) {
  const data = await getMaker(params.slug);
  if (!data) notFound();
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/makers/${params.slug}/ask`)}`);
  return (
    <div className="container-page max-w-2xl pt-8">
      <Link href={`/makers/${data.maker.slug}`} className="text-sm text-ink-muted hover:underline">
        ← Back to {data.maker.displayName}
      </Link>
      <h1 className="mt-3 text-3xl">Ask {data.maker.displayName} a question</h1>
      <p className="mt-1 text-sm text-ink-muted">
        {responseTimeLabel(data.maker.responseTimeHours)}. To ask about a specific piece, use “Ask
        the maker” on its page.
      </p>
      <div className="mt-6">
        <StartThreadForm makerId={data.maker.id} />
      </div>
    </div>
  );
}
