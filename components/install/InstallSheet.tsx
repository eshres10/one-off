'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export type SheetVariant = 'android' | 'ios' | 'in-app';

/**
 * "Add to home screen": a slide-up sheet on phones, in one of three versions (Android with the
 * browser's own install prompt, iOS with the Share-button steps, in-app browsers with "open in
 * your browser"), each with an order-placed line when it follows a purchase.
 * Escape, the dim, a swipe down past 80px and "Not now" all close it as "Not now".
 */
export function InstallSheet({
  variant,
  orderPlaced = false,
  appName,
  shareAt = 'bottom',
  onInstall,
  onCopyLink,
  onDismiss,
  onClose,
}: {
  variant: SheetVariant;
  orderPlaced?: boolean;
  /** The in-app browser's name ("Instagram"), or null if unknown. */
  appName?: string | null;
  /** Where iOS puts the Share button: Safari's bottom bar, or top right in iOS Chrome. */
  shareAt?: 'bottom' | 'top-right';
  /** Android: shows the browser's install prompt; resolves true when accepted. */
  onInstall?: () => Promise<boolean>;
  /** In-app: copies the link; resolves true when copied. */
  onCopyLink?: () => Promise<boolean>;
  /** Counted as "Not now". */
  onDismiss: () => void;
  /** Closed without counting (installed, or link copied and closed). */
  onClose: () => void;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);
  const [drag, setDrag] = useState(0);
  const dragFrom = useRef<number | null>(null);
  const [pointing, setPointing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  // Focus the primary button; give focus back to whatever had it when we close.
  useEffect(() => {
    opener.current = document.activeElement;
    primary.current?.focus();
    return () => {
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
      if (e.key !== 'Tab' || !panel.current) return;
      // Keep Tab inside the sheet.
      const items = panel.current.querySelectorAll<HTMLElement>('button, a[href], [tabindex="0"]');
      if (!items.length) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  const sub = orderPlaced
    ? 'Track this order from your home screen.'
    : variant === 'android'
      ? 'No app store. Takes two seconds.'
      : variant === 'ios'
        ? 'Two taps, no app store.'
        : `${appName ? `${appName}’s` : 'This app’s'} browser can’t save One Off to your home screen.`;
  const title =
    variant === 'in-app' ? 'Open in your browser first.' : 'One Off, on your home screen.';

  const steps: ReactNode =
    variant === 'android' ? (
      <Numbered items={['New drops first', 'Track every parcel', 'Your saved pieces']} />
    ) : variant === 'ios' ? (
      <>
        <Numbered
          items={[
            <span key="1" className="flex items-center gap-2">
              Tap <ShareGlyph /> Share{' '}
              {shareAt === 'bottom' ? 'in the bar below' : 'at the top right'}
            </span>,
            <span key="2" className="flex items-center gap-2">
              Choose <AddGlyph /> Add to Home Screen
            </span>,
          ]}
        />
        <p className="mt-4 text-[13px] text-muted">
          Then open One Off from your home screen to turn on drop alerts.
        </p>
      </>
    ) : (
      <Numbered items={['Tap ••• at the top right', 'Choose Open in browser']} />
    );

  // iOS "Show me": the sheet steps aside and an arrow points at the real Share button.
  if (pointing)
    return createPortal(
      <div
        className="fixed inset-0 z-[90] bg-[rgba(17,17,17,0.5)]"
        onClick={onClose}
        data-testid="install-pointing"
      >
        <ShareArrow at={shareAt} label />
      </div>,
      document.body,
    );

  return createPortal(
    <div className="fixed inset-0 z-[90]" data-testid="install-sheet" data-variant={variant}>
      <button
        type="button"
        aria-label="Not now"
        tabIndex={-1}
        onClick={onDismiss}
        className="install-dim absolute inset-0 cursor-default bg-[rgba(17,17,17,0.5)]"
        data-testid="install-dim"
      />
      {variant === 'ios' && shareAt === 'top-right' && <ShareArrow at="top-right" />}
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="install-sheet absolute inset-x-0 bottom-0 bg-ground px-6 pt-3"
        style={{
          paddingBottom: 'max(26px, env(safe-area-inset-bottom))',
          transform: drag ? `translateY(${drag}px)` : undefined,
        }}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button, a')) return;
          dragFrom.current = e.clientY;
        }}
        onPointerMove={(e) => {
          if (dragFrom.current !== null) setDrag(Math.max(0, e.clientY - dragFrom.current));
        }}
        onPointerUp={() => {
          if (drag > 80) onDismiss();
          dragFrom.current = null;
          setDrag(0);
        }}
        onPointerCancel={() => {
          dragFrom.current = null;
          setDrag(0);
        }}
      >
        <span aria-hidden className="mx-auto block h-1 w-10 rounded-full bg-line-strong" />
        <div className="mt-5 flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icon-192.png"
            alt=""
            width={64}
            height={64}
            className="h-16 w-16 shrink-0 rounded-[14px] shadow-sm"
          />
          <h2 id={titleId} className="font-display text-[28px] leading-[1.05]">
            {title}
          </h2>
        </div>
        <p className="mt-3 text-[14px] text-text2" data-testid="install-sub">
          {sub}
        </p>
        <div className="mt-5">{steps}</div>

        {variant === 'android' && (
          <>
            <button
              ref={primary}
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const ok = await onInstall?.();
                setBusy(false);
                if (ok) onClose();
                else onDismiss();
              }}
              className="mt-6 min-h-[52px] w-full bg-ink text-[11px] uppercase tracking-[0.2em] text-ground"
              data-testid="install-primary"
            >
              Add to home screen
            </button>
            <NotNow onClick={onDismiss} className="mt-3 w-full" />
          </>
        )}

        {variant === 'ios' && (
          <div className="mt-6 flex items-center justify-between">
            <NotNow onClick={onDismiss} />
            <button
              ref={primary}
              type="button"
              onClick={() => setPointing(true)}
              className="min-h-[48px] bg-ink px-6 text-[11px] uppercase tracking-[0.2em] text-ground"
              data-testid="install-primary"
            >
              Show me ↓
            </button>
          </div>
        )}
        {variant === 'ios' && shareAt === 'bottom' && <ShareArrow at="bottom" inline />}

        {variant === 'in-app' && (
          <>
            <button
              ref={primary}
              type="button"
              onClick={async () => setCopied(Boolean(await onCopyLink?.()))}
              className="mt-6 min-h-[52px] w-full border border-ink text-[11px] uppercase tracking-[0.2em]"
              data-testid="install-primary"
            >
              Copy link instead
            </button>
            {copied && (
              <p
                className="mt-3 bg-ink px-4 py-3 text-[13px] text-ground"
                role="status"
                data-testid="install-copied"
              >
                Link copied. Paste it into Safari or Chrome.
              </p>
            )}
            <div className="mt-4 flex items-center justify-between gap-4">
              <p className="text-[12px] text-muted">Your bag and saved pieces come with you</p>
              <NotNow onClick={onDismiss} />
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function NotNow({ onClick, className = '' }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[44px] text-[13px] underline underline-offset-[3px] ${className}`}
      data-testid="install-not-now"
    >
      Not now
    </button>
  );
}

function Numbered({ items }: { items: ReactNode[] }) {
  return (
    <ol className="space-y-3">
      {items.map((t, i) => (
        <li key={i} className="flex items-center gap-3 text-[15px]">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-circle border border-ink text-[12px]">
            {i + 1}
          </span>
          {t}
        </li>
      ))}
    </ol>
  );
}

function ShareGlyph() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
    >
      <path d="M12 3v12M8 7l4-4 4 4" />
      <path d="M6 11v9h12v-9" />
    </svg>
  );
}

function AddGlyph() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
    >
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

/** A bobbing arrow at the real Share button: Safari's bottom bar, or top right in iOS Chrome. */
function ShareArrow({
  at,
  inline = false,
  label = false,
}: {
  at: 'bottom' | 'top-right';
  inline?: boolean;
  label?: boolean;
}) {
  const arrow = (
    <span className="install-bob block text-[28px] leading-none" aria-hidden>
      {at === 'bottom' ? '↓' : '↑'}
    </span>
  );
  if (inline) return <div className="mt-3 flex justify-center text-ink">{arrow}</div>;
  return (
    <div
      className={`pointer-events-none absolute flex flex-col items-center gap-2 text-ground ${at === 'bottom' ? 'bottom-[max(2px,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2' : 'right-4 top-2'}`}
      data-testid="install-arrow"
    >
      {at === 'top-right' && arrow}
      {label && (
        <span className="whitespace-nowrap bg-ink px-3 py-2 text-[12px] text-ground">
          Tap Share, then Add to Home Screen
        </span>
      )}
      {at === 'bottom' && arrow}
    </div>
  );
}
