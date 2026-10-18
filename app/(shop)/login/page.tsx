import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { AuthForms } from '@/components/forms/AuthForms';

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
    <div className="container-page max-w-md pt-12">
      <h1 className="text-3xl sm:text-4xl">Welcome</h1>
      <p className="mt-2 text-ink-soft">
        Sign in to save pieces, follow makers, message makers and track orders. Checkout never
        requires an account.
      </p>
      {searchParams.error && (
        <p className="mt-4 rounded-lg bg-alert-light px-3 py-2 text-sm text-alert" role="alert">
          That sign-in link has expired or is invalid. Request a new one below.
        </p>
      )}
      <div className="mt-8">
        <AuthForms next={next} />
      </div>
    </div>
  );
}
