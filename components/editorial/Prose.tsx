import type { ReactNode } from 'react';

/** Quiet editorial column for policy pages: 640px measure, serif headings, hairline dividers. */
export function ProsePage({
  kicker,
  title,
  intro,
  children,
}: {
  kicker?: string;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <article className="container-page pt-12 md:pt-20">
      <div className="mx-auto max-w-[640px]">
        {kicker && <p className="eyebrow">{kicker}</p>}
        <h1 className="mt-3 text-[48px] leading-[0.95] md:text-[64px]">{title}</h1>
        {intro && <div className="mt-5 text-[15px] leading-relaxed text-text2">{intro}</div>}
        <div className="mt-10">{children}</div>
      </div>
    </article>
  );
}

export function ProseSection({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={id ? `${id}-title` : undefined}
      className="border-t border-line py-8 text-[15px] leading-relaxed text-text2 [&_li]:mt-1.5 [&_p+p]:mt-3"
    >
      <h2 id={id ? `${id}-title` : undefined} className="mb-4 text-[30px] leading-none text-ink">
        {title}
      </h2>
      {children}
    </section>
  );
}
