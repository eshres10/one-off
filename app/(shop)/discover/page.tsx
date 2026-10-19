import { getSessionUser } from '@/lib/auth/session';
import { editBySlug } from '@/lib/discover/edits';
import { parseDiscover } from '@/lib/discover/params';
import { getSavedProductIds } from '@/lib/queries/catalog';
import { getDiscoverPage } from '@/lib/queries/discover';
import { getFollowedMakerIds } from '@/lib/queries/rails';
import { getSavedCount } from '@/lib/queries/saved';
import { DiscoverView } from '@/components/discover/DiscoverView';

export const dynamic = 'force-dynamic';

export function generateMetadata({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const edit = editBySlug(parseDiscover(searchParams).edit ?? undefined);
  return { title: edit ? edit.title : 'Discover' };
}

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const params = parseDiscover(searchParams);
  const user = await getSessionUser();
  const [initial, saved, following, savedCount] = await Promise.all([
    getDiscoverPage(params),
    getSavedProductIds(user?.id ?? null),
    getFollowedMakerIds(user?.id ?? null),
    user ? getSavedCount(user) : Promise.resolve(0),
  ]);
  return (
    <DiscoverView
      params={params}
      initial={initial}
      savedIds={[...saved]}
      followingIds={[...following]}
      savedCount={savedCount}
    />
  );
}
