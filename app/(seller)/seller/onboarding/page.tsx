import Link from 'next/link';
import { requireSeller } from '@/lib/auth/session';
import { getSellerMaker } from '@/lib/queries/seller';
import { submitProfileForReviewAction } from '@/lib/actions/seller';
import { ProfileForm } from '@/components/seller/ProfileForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { StatusPill } from '@/components/ui/Badge';

export const metadata = { title: 'Profile & settings' };

export default async function OnboardingPage() {
  const seller = await requireSeller();
  const maker = await getSellerMaker(seller);
  return (
    <div className="max-w-3xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl">Profile & settings</h1>
        <div className="flex items-center gap-3">
          <StatusPill status={maker.status} />
          {maker.status === 'approved' && (
            <Link href={`/makers/${maker.slug}`} className="text-sm underline underline-offset-4">
              View public profile
            </Link>
          )}
        </div>
      </div>
      {maker.status === 'draft' && (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
          <p>
            When your profile, shipping, returns and payouts are ready, submit it for review. You
            can’t publish listings until it’s approved.
          </p>
          <form action={submitProfileForReviewAction}>
            <SubmitButton size="sm" disabled={!maker.story || !maker.stripeOnboardingComplete}>
              Submit for review
            </SubmitButton>
          </form>
          {(!maker.story || !maker.stripeOnboardingComplete) && (
            <p className="w-full text-xs text-ink-muted">
              Add your story and{' '}
              <Link href="/seller/payouts" className="link">
                set up payouts
              </Link>{' '}
              first.
            </p>
          )}
        </div>
      )}
      {maker.status === 'pending' && (
        <p className="rounded-lg bg-stone-light px-3 py-2 text-sm">
          Your profile is with our team for review. We’ll email you when it’s approved.
        </p>
      )}
      {maker.status === 'paused' && maker.rejectionReason && (
        <p className="rounded-lg bg-alert-light px-3 py-2 text-sm text-alert">
          Paused by our team: {maker.rejectionReason}
        </p>
      )}
      <ProfileForm maker={maker} />
    </div>
  );
}
