import type { ReactNode } from 'react';
import { ButtonLink } from '@/components/ui/Button';

export interface StateAction {
  label: string;
  href?: string;
  /** A client button instead of a link (e.g. "Try again"). */
  button?: ReactNode;
  testId?: string;
}

/**
 * The shape of every empty or error state: a fine line drawing, a serif headline, one plain
 * sentence and a clear next step. Nothing is a dead end.
 */
export function EmptyState({
  icon,
  title,
  body,
  actions = [],
  children,
  eyebrow,
  footnote,
  testId,
  className = '',
  level = 2,
}: {
  icon?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  /** Primary first, then an optional secondary. */
  actions?: StateAction[];
  children?: ReactNode;
  eyebrow?: ReactNode;
  footnote?: ReactNode;
  testId?: string;
  className?: string;
  /** 1 when the state is the whole page (errors), otherwise 2 under the page's own heading. */
  level?: 1 | 2;
}) {
  const Heading = level === 1 ? 'h1' : 'h2';
  return (
    <section
      className={`mx-auto flex max-w-[560px] flex-col items-center px-8 py-14 text-center md:py-20 ${className}`}
      data-testid={testId}
    >
      {icon && <div className="mb-7 text-ink">{icon}</div>}
      {eyebrow && (
        <p className="mb-3 text-[11px] uppercase tracking-label text-muted-2">{eyebrow}</p>
      )}
      <Heading className="font-display text-[38px] leading-[1.02] md:text-[48px]">{title}</Heading>
      {body && <p className="mt-4 max-w-[36ch] text-[14px] leading-relaxed text-muted">{body}</p>}
      {children && <div className="mt-8 w-full">{children}</div>}
      {actions.length > 0 && (
        <div className="mt-8 flex w-full max-w-[320px] flex-col gap-3">
          {actions.map((a, i) =>
            a.button ? (
              <div key={a.label}>{a.button}</div>
            ) : (
              <ButtonLink
                key={a.label}
                href={a.href ?? '/'}
                variant={i === 0 ? 'primary' : 'secondary'}
                className="w-full"
                data-testid={a.testId}
              >
                {a.label}
              </ButtonLink>
            ),
          )}
        </div>
      )}
      {footnote && (
        <p className="mt-8 text-[10px] uppercase tracking-label text-muted-2">{footnote}</p>
      )}
    </section>
  );
}
