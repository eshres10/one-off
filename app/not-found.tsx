import Link from 'next/link';

export default function NotFound() {
  return (
    <main
      id="main"
      className="container-page flex min-h-[60vh] flex-col items-center justify-center text-center"
    >
      <p className="eyebrow">404</p>
      <h1 className="mt-2 text-4xl">We couldn’t find that page</h1>
      <p className="mt-2 text-ink-muted">The piece may have sold or the link may be out of date.</p>
      <Link
        href="/"
        className="mt-6 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper"
      >
        Back to Discover
      </Link>
    </main>
  );
}
