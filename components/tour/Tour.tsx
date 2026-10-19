'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Monogram } from '@/components/ui/Monogram';
import { Img as Image } from '@/components/ui/Img';

export interface TourStop {
  /** Matches `data-tour="…"` on the element to spotlight. */
  target: string;
  title: string;
  body: string;
  tip?: string;
}

export interface TourWelcome {
  title: string;
  subtitle: string;
  intro: string;
  tiles: Array<{ title: string; body: string }>;
  dismissLabel: string;
  startLabel: string;
  image: string;
}

const GAP = 6; // spotlight padding around the target
const TIP_W = 340;
const MARGIN = 16;

type Phase = 'welcome' | 'tour' | 'final' | 'closed';
type Rect = { top: number; left: number; width: number; height: number };

function visibleRect(target: string): Rect | null {
  const els = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`));
  for (const el of els) {
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    if (r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.display !== 'none')
      return { top: r.top, left: r.left, width: r.width, height: r.height };
  }
  return null;
}

/**
 * A first-visit tour: a welcome window, then a spotlight that moves between `data-tour`
 * targets with a tooltip, then a final card. Stops whose target is hidden are skipped. → and
 * Enter go on, ← goes back, Esc skips. Desktop only; it never blocks the page if nothing matches.
 */
export function Tour({
  welcome,
  stops,
  final,
  onComplete,
  startAt = 'welcome',
  minWidth = 768,
  testId = 'tour',
}: {
  welcome: TourWelcome;
  stops: TourStop[];
  /** The last card's content; receives replay() and finish(). */
  final: (api: { replay: () => void; finish: () => void }) => React.ReactNode;
  onComplete: () => Promise<unknown>;
  startAt?: 'welcome' | 'tour';
  minWidth?: number;
  testId?: string;
}) {
  const [phase, setPhase] = useState<Phase>('closed');
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [tipPos, setTipPos] = useState<{
    top: number;
    left: number;
    above: boolean;
    arrow: number;
  }>();
  const tipRef = useRef<HTMLDivElement>(null);
  const welcomeRef = useRef<HTMLDivElement>(null);
  const finalRef = useRef<HTMLDivElement>(null);
  const done = useRef(false);

  // Stops whose targets are on screen right now.
  const live = useCallback(() => stops.filter((s) => visibleRect(s.target)), [stops]);
  const [active, setActive] = useState<TourStop[]>([]);

  useEffect(() => {
    if (window.matchMedia(`(min-width: ${minWidth}px)`).matches) setPhase(startAt);
  }, [minWidth, startAt]);

  const complete = useCallback(() => {
    if (done.current) return;
    done.current = true;
    void onComplete();
  }, [onComplete]);

  const close = useCallback(() => {
    complete();
    setPhase('closed');
  }, [complete]);

  const startTour = useCallback(() => {
    const a = live();
    setActive(a);
    setIndex(0);
    setPhase(a.length ? 'tour' : 'final');
  }, [live]);

  const next = useCallback(() => {
    if (index + 1 < active.length) setIndex(index + 1);
    else {
      complete();
      setPhase('final');
    }
  }, [index, active.length, complete]);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  // Position the spotlight and tooltip; follow resizes and scrolling.
  const stop = phase === 'tour' ? active[index] : undefined;
  const measure = useCallback(() => {
    if (!stop) return;
    const r = visibleRect(stop.target);
    if (!r) {
      // The target disappeared (window narrowed): skip it.
      next();
      return;
    }
    setRect(r);
    const tipH = tipRef.current?.offsetHeight ?? 220;
    const below = r.top + r.height + GAP + 14;
    const above = below + tipH > window.innerHeight - MARGIN && r.top - GAP - 14 - tipH > MARGIN;
    const top = above ? r.top - GAP - 14 - tipH : below;
    const center = r.left + r.width / 2;
    const left = Math.min(Math.max(MARGIN, center - TIP_W / 2), window.innerWidth - TIP_W - MARGIN);
    setTipPos({ top, left, above, arrow: Math.min(Math.max(18, center - left), TIP_W - 18) });
  }, [stop, next]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);
  useEffect(() => {
    if (phase !== 'tour') return;
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    window.addEventListener('resize', on);
    window.addEventListener('scroll', on, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', on);
      window.removeEventListener('scroll', on, true);
    };
  }, [phase, measure]);

  // Focus follows the step; keys drive the tour.
  useEffect(() => {
    if (phase === 'tour') tipRef.current?.focus();
    if (phase === 'welcome') welcomeRef.current?.focus();
    if (phase === 'final') finalRef.current?.focus();
  }, [phase, index]);
  useEffect(() => {
    if (phase === 'closed') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (phase === 'tour' && (e.key === 'ArrowRight' || e.key === 'Enter')) {
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'BUTTON') return;
        e.preventDefault();
        next();
      } else if (phase === 'tour' && e.key === 'ArrowLeft') {
        e.preventDefault();
        back();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, next, back, close]);

  if (phase === 'closed') return null;

  const announce =
    phase === 'tour' && stop
      ? `Step ${index + 1} of ${active.length}: ${stop.title}`
      : phase === 'final'
        ? 'Tour finished'
        : welcome.title;

  return (
    <div data-testid={testId}>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      {phase === 'welcome' && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(17,17,17,0.62)] p-4">
          <div
            ref={welcomeRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tour-welcome-title"
            tabIndex={-1}
            className="w-full max-w-[560px] overflow-hidden bg-ground outline-none"
            data-testid="tour-welcome"
          >
            <div className="relative flex h-[150px] items-center justify-center bg-ink">
              <Image
                src={welcome.image}
                alt=""
                fill
                sizes="560px"
                className="object-cover opacity-45"
              />
              <Monogram className="relative h-16 w-16 text-ground" />
            </div>
            <div className="p-7">
              <h2 id="tour-welcome-title" className="text-[40px] leading-none">
                {welcome.title}
              </h2>
              <p className="mt-2 text-[15px]">{welcome.subtitle}</p>
              <p className="mt-3 text-[13px] leading-relaxed text-muted">{welcome.intro}</p>
              <ul className="mt-5 grid grid-cols-3 gap-2" role="list">
                {welcome.tiles.map((t) => (
                  <li key={t.title} className="bg-stone p-3">
                    <p className="font-display text-[18px] leading-tight">{t.title}</p>
                    <p className="mt-1 text-[11px] leading-snug text-muted">{t.body}</p>
                  </li>
                ))}
              </ul>
              <div className="mt-6 flex items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={close}
                  className="min-h-[44px] text-[12px] underline underline-offset-4"
                  data-testid="tour-dismiss"
                >
                  {welcome.dismissLabel}
                </button>
                <button
                  type="button"
                  onClick={startTour}
                  className="glass-dark min-h-[48px] px-6 text-[11px] uppercase tracking-[0.18em] text-ground"
                  data-testid="tour-start"
                >
                  {welcome.startLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {phase === 'tour' && stop && rect && (
        <>
          {/* Catches clicks so the page underneath can't be used mid-tour. */}
          <div className="fixed inset-0 z-[70]" aria-hidden onClick={(e) => e.stopPropagation()} />
          <div
            aria-hidden
            className="pointer-events-none fixed z-[71] outline outline-[1.5px] outline-ground motion-safe:transition-all motion-safe:duration-[380ms] motion-safe:ease-out"
            style={{
              top: rect.top - GAP,
              left: rect.left - GAP,
              width: rect.width + GAP * 2,
              height: rect.height + GAP * 2,
              boxShadow: '0 0 0 4000px rgba(17,17,17,0.62)',
            }}
            data-testid="tour-spotlight"
          />
          <div
            ref={tipRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tour-step-title"
            tabIndex={-1}
            className="fixed z-[72] bg-ground p-5 outline-none motion-safe:transition-[top,left] motion-safe:duration-[380ms] motion-safe:ease-out"
            style={{ width: TIP_W, top: tipPos?.top ?? -9999, left: tipPos?.left ?? 0 }}
            data-testid="tour-tooltip"
          >
            <span
              aria-hidden
              className="absolute h-3 w-3 rotate-45 bg-ground"
              style={{
                left: (tipPos?.arrow ?? 20) - 6,
                [tipPos?.above ? 'bottom' : 'top']: -6,
              }}
            />
            <div className="flex items-center justify-between text-[11px] uppercase tracking-label text-muted-2">
              <span data-testid="tour-count">
                {index + 1} of {active.length}
              </span>
              <button
                type="button"
                onClick={close}
                className="min-h-[32px] underline underline-offset-4"
                data-testid="tour-skip"
              >
                Skip tour
              </button>
            </div>
            <h2 id="tour-step-title" className="mt-2 text-[28px] leading-none">
              {stop.title}
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed">{stop.body}</p>
            {stop.tip && (
              <p className="mt-3 bg-stone p-3 text-[12px] leading-relaxed">{stop.tip}</p>
            )}
            <div className="mt-4 flex items-center justify-between">
              <div className="flex gap-1.5" aria-hidden>
                {active.map((s, i) => (
                  <span
                    key={s.target}
                    className={`h-1.5 w-1.5 rounded-circle ${i === index ? 'bg-ink' : 'bg-line-strong'}`}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                {index > 0 && (
                  <button
                    type="button"
                    onClick={back}
                    className="min-h-[40px] px-3 text-[11px] uppercase tracking-label"
                    data-testid="tour-back"
                  >
                    Back
                  </button>
                )}
                <button
                  type="button"
                  onClick={next}
                  className="glass-dark min-h-[40px] px-4 text-[11px] uppercase tracking-label text-ground"
                  data-testid="tour-next"
                >
                  {index + 1 === active.length ? 'Finish' : 'Next'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {phase === 'final' && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(17,17,17,0.62)] p-4">
          <div
            ref={finalRef}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            className="w-full max-w-[560px] bg-ground p-7 outline-none"
            data-testid="tour-final"
          >
            {final({
              replay: () => {
                done.current = false;
                startTour();
              },
              finish: close,
            })}
          </div>
        </div>
      )}
    </div>
  );
}
