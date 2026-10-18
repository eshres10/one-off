import type { ReactNode } from 'react';

/** Stone info panel for lead time, delivery range, condition and deposit notes. */
export function InfoPanel({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-stone-light px-4 py-3.5 text-[13px] leading-relaxed text-text2 ${className}`}
    >
      {children}
    </div>
  );
}

/** Native <details> accordion with uppercase summary and a "+". */
export function Accordion({
  title,
  children,
  open = false,
  id,
}: {
  title: string;
  children: ReactNode;
  open?: boolean;
  id?: string;
}) {
  return (
    <details id={id} open={open} className="group border-b border-line">
      <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between text-[11px] uppercase tracking-label [&::-webkit-details-marker]:hidden">
        {title}
        <span aria-hidden className="text-[14px] transition-transform group-open:rotate-45">
          +
        </span>
      </summary>
      <div className="pb-5 text-[13px] leading-relaxed text-text2">{children}</div>
    </details>
  );
}

export function PageTitle({
  kicker,
  title,
  children,
}: {
  kicker?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className="mb-8 md:mb-12">
      {kicker && <p className="eyebrow">{kicker}</p>}
      <h1 className="mt-2 text-[44px] leading-[0.95] md:text-[56px]">{title}</h1>
      {children && <div className="mt-3 max-w-2xl text-[15px] text-muted">{children}</div>}
    </header>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <h2 className="text-[34px] leading-none md:text-[44px]">{children}</h2>
      {action}
    </div>
  );
}
