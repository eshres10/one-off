'use client';

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="glass-dark mt-8 min-h-[44px] px-6 text-[11px] uppercase tracking-label print:hidden"
    >
      Print
    </button>
  );
}
