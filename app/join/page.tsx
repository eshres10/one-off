import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { env } from '@/lib/env';
import { magicLinksEnabled } from '@/lib/features';
import { JoinForm } from '@/components/onboarding/JoinForm';
import { Img as Image } from '@/components/ui/Img';
import { Wordmark } from '@/components/ui/Wordmark';
import { GoogleMark } from '@/components/ui/GoogleMark';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Join Off One' };

const PROVIDERS = [
  { id: 'apple', label: 'Continue with Apple' },
  { id: 'google', label: 'Continue with Google' },
] as const;

/** Sign up: full-bleed photo with the wordmark, then Apple, Google or email. */
export default async function JoinPage() {
  if (await getSessionUser()) redirect('/welcome');
  const e = env();
  const enabled =
    e.AUTH_DRIVER === 'supabase' ? e.AUTH_OAUTH_PROVIDERS.split(',').map((p) => p.trim()) : [];
  return (
    <main className="min-h-[100dvh] bg-ground md:grid md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <section className="relative flex h-[56vh] min-h-[380px] flex-col justify-between overflow-hidden p-5 text-ground md:sticky md:top-0 md:h-[100dvh] md:p-10">
        <Image
          src="/seed/hero-velvet-sofa.jpg"
          alt=""
          fill
          priority
          sizes="(min-width: 768px) 55vw, 100vw"
          className="object-cover object-[center_30%]"
        />
        <span
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-[rgba(17,17,17,0.35)] via-transparent to-[rgba(17,17,17,0.6)]"
        />
        <Link href="/" aria-label="Off One home" className="relative w-fit">
          <Wordmark className="text-ground" />
        </Link>
        <h1 className="relative max-w-[12ch] text-[48px] leading-[0.95] md:text-[72px]">
          Clothes made for one. Starting with you.
        </h1>
      </section>
      <section className="mx-auto w-full max-w-[480px] px-5 py-8 md:flex md:flex-col md:justify-center md:px-10">
        <div className="space-y-2">
          {PROVIDERS.map((p) =>
            enabled.includes(p.id) ? (
              <a
                key={p.id}
                href={`/auth/oauth?provider=${p.id}&next=${encodeURIComponent('/welcome')}`}
                className="flex min-h-[52px] items-center justify-center gap-3 border border-ink text-[11px] uppercase tracking-label"
              >
                {p.id === 'google' && <GoogleMark />}
                {p.label}
              </a>
            ) : (
              <span
                key={p.id}
                aria-disabled
                className="flex min-h-[52px] cursor-not-allowed items-center justify-center border border-line-strong text-[11px] uppercase tracking-label text-muted-2"
                title="Coming soon"
              >
                {p.label}
              </span>
            ),
          )}
          {enabled.length === 0 && (
            <p className="text-center text-[12px] text-muted-2">
              Apple and Google sign-in are coming soon. Use your email for now.
            </p>
          )}
        </div>
        <div className="my-6 flex items-center gap-3 text-[11px] uppercase tracking-label text-muted-2">
          <span className="h-px flex-1 bg-line" aria-hidden />
          or
          <span className="h-px flex-1 bg-line" aria-hidden />
        </div>
        <JoinForm magicLinks={magicLinksEnabled()} />
        <p className="mt-6 text-center text-[13px]">
          Already a member?{' '}
          <Link href="/login" className="underline underline-offset-4">
            Log in
          </Link>
        </p>
        <p className="mt-4 text-center text-[12px] leading-relaxed text-muted-2">
          By joining you agree to our{' '}
          <Link href="/legal/terms" className="underline underline-offset-2">
            terms
          </Link>{' '}
          and{' '}
          <Link href="/legal/terms#privacy" className="underline underline-offset-2">
            privacy policy
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
