import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { getCartSessionId } from '@/lib/actions/util';
import { checkoutEnabled } from '@/lib/features';
import { getFollowedMakers, getSavedPieces } from '@/lib/queries/saved';
import { LocalSaved } from '@/components/saved/LocalSaved';
import { SavedView } from '@/components/saved/SavedView';

export const metadata = { title: 'Saved' };

export default async function SavedPage() {
  const user = await getSessionUser();
  const checkoutOn = await checkoutEnabled();
  const [pieces, makers] = user
    ? await Promise.all([getSavedPieces(user, getCartSessionId()), getFollowedMakers(user)])
    : [null, null];
  return (
    <div className="container-page pt-8 md:pt-12">
      <h1 className="text-[40px] leading-none md:text-[56px]">Saved</h1>
      {!user && (
        <p className="mt-2 text-[13px] text-muted">
          Saved on this device.{' '}
          <Link href="/login?next=/saved" className="link">
            Sign in
          </Link>{' '}
          to keep them everywhere.
        </p>
      )}
      <div className="mt-6">
        {user ? (
          <SavedView pieces={pieces ?? []} makers={makers} signedIn checkoutOn={checkoutOn} />
        ) : (
          <LocalSaved checkoutOn={checkoutOn} />
        )}
      </div>
    </div>
  );
}
