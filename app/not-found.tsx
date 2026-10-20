import Link from 'next/link';
import { Monogram } from '@/components/ui/Monogram';
import { Wordmark } from '@/components/ui/Wordmark';
import { ButtonLink } from '@/components/ui/Button';

export const metadata = { title: 'Page not found', robots: { index: false } };

/** 404: "4 OO 4", with the monogram as the zeros. Next returns a real 404 status for this page. */
export default function NotFound() {
  return (
    <main id="main" className="flex min-h-screen flex-col bg-ground">
      <header className="flex justify-center py-6">
        <Link href="/" aria-label="Off One home">
          <Wordmark className="h-7 w-auto" />
        </Link>
      </header>
      <section
        className="mx-auto flex w-full max-w-[560px] flex-1 flex-col items-center justify-center px-8 pb-16 text-center"
        data-testid="not-found"
      >
        <p
          className="flex items-center gap-3 font-display text-[88px] leading-none md:text-[120px]"
          aria-label="404"
        >
          <span aria-hidden>4</span>
          <Monogram className="h-[0.78em] w-[0.78em]" />
          <span aria-hidden>4</span>
        </p>
        <h1 className="mt-8 font-display text-[38px] leading-[1.02] md:text-[48px]">
          This one got away.
        </h1>
        <p className="mt-4 max-w-[36ch] text-[14px] leading-relaxed text-muted">
          The page you’re after has moved or no longer exists. Like a one-of-one, some things only
          happen once.
        </p>
        <form action="/search" className="mt-8 flex w-full max-w-[320px]" role="search">
          <label htmlFor="nf-q" className="sr-only">
            Search pieces and makers
          </label>
          <input
            id="nf-q"
            name="q"
            placeholder="Search pieces and makers"
            className="min-h-[52px] flex-1 border border-line-strong bg-surface px-4 text-[14px]"
            data-testid="not-found-search"
          />
          <button
            type="submit"
            className="min-h-[52px] border border-l-0 border-line-strong bg-surface px-4 text-[11px] uppercase tracking-label"
          >
            Search
          </button>
        </form>
        <ButtonLink href="/" variant="secondary" className="mt-3 w-full max-w-[320px]">
          Back to home
        </ButtonLink>
      </section>
    </main>
  );
}
