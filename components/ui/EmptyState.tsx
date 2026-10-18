import type { ReactNode } from 'react';

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
    <div className="mx-auto max-w-md rounded-2xl border border-dashed border-stone-dark/60 px-6 py-12 text-center">
      <p className="font-display text-xl">{title}</p>
      {children && <div className="mt-2 text-sm text-ink-muted">{children}</div>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
