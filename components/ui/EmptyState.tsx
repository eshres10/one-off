import type { ReactNode } from 'react';

/** One serif line, one line of guidance, one outline button. */
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-lg border-y border-line px-6 py-16 text-center">
      <p className="font-display text-[32px] leading-tight">{title}</p>
      {children && <div className="mt-2 text-[14px] text-muted">{children}</div>}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}
