import { notFound, redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getMaker } from '@/lib/queries/catalog';
import { StartThreadForm } from '@/components/messaging/StartThreadForm';
import { ThreadHeader } from '@/components/messaging/ThreadHeader';

export const metadata = { title: 'Ask a question' };

export default async function AskMakerGeneralPage({ params }: { params: { slug: string } }) {
  const data = await getMaker(params.slug);
  if (!data) notFound();
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/makers/${params.slug}/ask`)}`);
  return (
    <div className="mx-auto max-w-2xl px-4 md:pt-6">
      <ThreadHeader
        backHref={`/makers/${data.maker.slug}`}
        name={data.maker.displayName}
        responseHours={data.maker.responseTimeHours}
        avatarUrl={data.maker.avatarUrl}
      />
      <div className="mt-4">
        <StartThreadForm makerId={data.maker.id} />
      </div>
    </div>
  );
}
