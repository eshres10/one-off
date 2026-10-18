import Link from 'next/link';

/** System pages (404, 500, permission denied, maintenance): one serif line, one sentence, a link home. */
export function SystemMessage({
  code,
  title,
  body,
  action,
}: {
  code?: string;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <main
      id="main"
      className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center"
    >
      {code && <p className="eyebrow">{code}</p>}
      <h1 className="mt-3 max-w-[18ch] text-[44px] leading-none md:text-[64px]">{title}</h1>
      <p className="mt-4 max-w-md text-[15px] text-muted">{body}</p>
      <div className="mt-8">
        {action ?? (
          <Link
            href="/"
            className="text-[11px] uppercase tracking-label underline underline-offset-[6px]"
          >
            Back to Discover
          </Link>
        )}
      </div>
    </main>
  );
}
