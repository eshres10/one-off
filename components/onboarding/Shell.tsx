import Link from 'next/link';
import { ArrowLeftIcon } from '@/components/ui/icons';

export const WELCOME_STEPS = 5;

/**
 * The /welcome frame: back arrow (top left), Skip (top right), a five-segment progress bar, then
 * the step. Full screen on a phone; a centred 480px column on the ground colour on desktop.
 */
export function WelcomeShell({
  step,
  title,
  intro,
  children,
  footer,
  pinned,
  lead,
}: {
  step: number;
  title: string;
  intro?: React.ReactNode;
  children: React.ReactNode;
  /** Pinned under the header while the step scrolls (the taste picker's summary bar). */
  pinned?: React.ReactNode;
  /** Shown above the headline (the monogram on the last screen). */
  lead?: React.ReactNode;
  /** The sticky bottom action (Continue). */
  footer?: React.ReactNode;
}) {
  return (
    <main
      className="mx-auto flex min-h-[100dvh] max-w-[480px] flex-col bg-ground"
      data-testid={`welcome-step-${step}`}
    >
      <header className="sticky top-0 z-20 bg-ground/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+8px)] backdrop-blur">
        <div className="flex h-11 items-center justify-between">
          <Link
            href={step <= 1 ? '/' : `/welcome?step=${step - 1}`}
            aria-label="Back"
            className="-ml-2 flex h-11 w-11 items-center justify-center"
          >
            <ArrowLeftIcon width={18} height={18} />
          </Link>
          {step <= WELCOME_STEPS && (
            <Link
              href="/welcome?step=6"
              className="flex min-h-[44px] items-center text-[11px] uppercase tracking-label text-muted"
              data-testid="welcome-skip"
            >
              Skip
            </Link>
          )}
        </div>
        {step <= WELCOME_STEPS && (
          <div
            className="mt-1 grid grid-cols-5 gap-1"
            role="img"
            aria-label={`Step ${step} of ${WELCOME_STEPS}`}
          >
            {Array.from({ length: WELCOME_STEPS }, (_, i) => (
              <span key={i} className={`h-[3px] ${i < step ? 'bg-ink' : 'bg-line-strong'}`} />
            ))}
          </div>
        )}
        {pinned && <div className="mt-3">{pinned}</div>}
      </header>
      <div className="flex-1 px-4 pb-6">
        {lead}
        {step <= WELCOME_STEPS && (
          <p className="mt-4 text-[11px] uppercase tracking-label text-muted-2">
            {step} of {WELCOME_STEPS}
          </p>
        )}
        <h1 className="mt-2 text-[40px] leading-[1]">{title}</h1>
        {intro && <div className="mt-3 text-[14px] text-muted">{intro}</div>}
        <div className="mt-6">{children}</div>
      </div>
      {footer && (
        <div className="sticky bottom-0 z-20 bg-ground/95 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur">
          {footer}
        </div>
      )}
    </main>
  );
}

export function ContinueButton({
  disabled,
  pending,
  onClick,
  children,
  testId = 'welcome-continue',
}: {
  disabled?: boolean;
  pending?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled || pending}
      onClick={onClick}
      className="glass-dark min-h-[52px] w-full text-[11px] uppercase tracking-[0.18em] text-ground disabled:cursor-not-allowed disabled:opacity-50"
      data-testid={testId}
    >
      {children}
    </button>
  );
}
