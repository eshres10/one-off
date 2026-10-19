import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { AuthForms } from '@/components/forms/AuthForms';
import { magicLinksEnabled } from '@/lib/features';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; error?: string };
}) {
  const next =
    searchParams.next?.startsWith('/') && !searchParams.next.startsWith('//')
      ? searchParams.next
      : '/account';
  if (await getSessionUser()) redirect(next);
  return (
    <div className="mx-auto max-w-md px-4 pt-12 md:pt-20">
      <p className="eyebrow">Your account</p>
      <h1 className="mt-2 text-[48px] leading-none">Welcome</h1>
      <p className="mt-3 text-[14px] text-muted">
        Sign in to save pieces, follow makers, message makers and track orders. Checkout never
        requires an account.
      </p>
      {searchParams.error && (
        <p className="mt-4 bg-error-bg px-3 py-2.5 text-[13px] text-error" role="alert">
          That sign-in link has expired or is invalid. Request a new one below.
        </p>
      )}
      <div className="mt-8">
        <AuthForms next={next} magicLinks={magicLinksEnabled()} />
      </div>
      {next.startsWith('/studio') ? (
        <p className="mt-8 text-center text-[13px]" data-testid="login-apply">
          Not selling with us yet?{' '}
          <Link href="/sell/apply" className="underline underline-offset-4">
            Apply to sell
          </Link>
        </p>
      ) : (
        <p className="mt-8 text-center text-[13px]">
          New to One Off?{' '}
          <Link href="/join" className="underline underline-offset-4">
            Join
          </Link>
        </p>
      )}
    </div>
  );
}
