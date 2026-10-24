'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type TouchEvent,
} from 'react';
import { Img as Image } from '@/components/ui/Img';
import { ArrowRightIcon } from '@/components/ui/icons';
import { formatPrice } from '@/lib/domain/money';

export interface HeroSlide {
  id: string;
  slug: string;
  title: string;
  priceCents: number;
  src: string;
  focus: string | null;
}

/** How long each piece is the current one. The crossfade (1400ms) runs inside this. */
export const HOLD_MS = 3400;

type Pos = { cur: number; prev: number | null; moved: boolean };

/**
 * The featured-maker hero: the full-bleed photo layer that rotates through the maker's pieces, the
 * wash above it, the server-rendered text (children), the piece caption, the progress bar and the
 * pause button. One clock drives the slides and the progress bar.
 */
export function FeaturedHeroSlides({
  slides,
  variant,
  className,
  children,
  testId,
  labelledBy,
}: {
  slides: HeroSlide[];
  variant: 'desktop' | 'phone';
  className: string;
  children: ReactNode;
  testId?: string;
  labelledBy?: string;
}) {
  const n = slides.length;
  // Both the desktop and the phone hero are in the page (one is hidden), so test ids differ.
  const sfx = variant === 'phone' ? '-phone' : '';
  const [pos, go] = useReducer(
    (state: Pos, action: number | 'next'): Pos => {
      const to = action === 'next' ? (state.cur + 1) % n : action;
      return to === state.cur ? state : { cur: to, prev: state.cur, moved: true };
    },
    { cur: 0, prev: null, moved: false },
  );
  const [userPaused, setUserPaused] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);
  const [inView, setInView] = useState(true);
  const [covered, setCovered] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [mounted, setMounted] = useState(false);
  // The caption lags the photo: it fades out (200ms), swaps, then fades in (300ms).
  const [shown, setShown] = useState(0);
  const [captionOn, setCaptionOn] = useState(true);

  const root = useRef<HTMLElement>(null);
  const elapsed = useRef(0);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const running =
    mounted && !reduced && !userPaused && tabVisible && inView && !covered && !hovered && !focused;

  const jump = useCallback(
    (to: number) => {
      elapsed.current = 0;
      root.current?.style.setProperty('--p', '0');
      go(((to % n) + n) % n);
    },
    [n],
  );

  // Reduced motion, hydration flag, tab visibility.
  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    const vis = () => setTabVisible(document.visibilityState === 'visible');
    vis();
    document.addEventListener('visibilitychange', vis);
    return () => {
      mq.removeEventListener('change', sync);
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);

  // Off screen (a hidden variant, or scrolled away), and covered by the shutter sheet.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(Boolean(e?.isIntersecting)), {
      threshold: 0.15,
    });
    io.observe(el);
    let off = () => {};
    if (variant === 'desktop') {
      // The hero is sticky and the next sheet slides over it, so it never leaves the viewport:
      // measure how much of it the sheet has covered.
      const check = () => {
        const sheet = document.querySelector('[data-shutter]');
        if (!sheet) return setCovered(false);
        const h = el.getBoundingClientRect().height || 1;
        setCovered(sheet.getBoundingClientRect().top < h * 0.15);
      };
      check();
      window.addEventListener('scroll', check, { passive: true });
      window.addEventListener('resize', check);
      off = () => {
        window.removeEventListener('scroll', check);
        window.removeEventListener('resize', check);
      };
    }
    return () => {
      io.disconnect();
      off();
    };
  }, [variant]);

  // The single clock. Slides and the progress bar both read `elapsed`.
  useEffect(() => {
    const el = root.current;
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      elapsed.current += Math.min(now - last, 100);
      last = now;
      if (elapsed.current >= HOLD_MS) {
        elapsed.current -= HOLD_MS;
        go('next');
      }
      el?.style.setProperty('--p', String(Math.min(elapsed.current / HOLD_MS, 1)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, n]);

  // Caption: out, swap, in.
  useEffect(() => {
    if (pos.cur === shown) return;
    if (reduced) {
      setShown(pos.cur);
      return;
    }
    setCaptionOn(false);
    const t = setTimeout(() => {
      setShown(pos.cur);
      setCaptionOn(true);
    }, 200);
    return () => clearTimeout(t);
  }, [pos.cur, shown, reduced]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      jump(pos.cur + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      jump(pos.cur - 1);
    }
  };

  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    if (t) touch.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: TouchEvent) => {
    const s = touch.current;
    const t = e.changedTouches[0];
    touch.current = null;
    if (!s || !t) return;
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) jump(pos.cur + (dx < 0 ? 1 : -1));
  };

  // Three photos at most: the one leaving, the current one and the next, already loading.
  const next = (pos.cur + 1) % n;
  const mountedIdx = [pos.prev, pos.cur, next].filter(
    (v, i, a): v is number => v !== null && a.indexOf(v) === i,
  );
  const stateOf = (i: number) =>
    i === pos.cur ? (pos.moved ? 'current' : 'first') : i === pos.prev ? 'out' : 'idle';

  const slide = slides[shown] ?? slides[0]!;

  return (
    <section
      ref={root}
      data-hero=""
      data-testid={testId}
      data-running={running ? 'true' : 'false'}
      data-index={pos.cur}
      aria-roledescription="carousel"
      aria-labelledby={labelledBy}
      className={`${className} ${variant === 'phone' ? 'fh-phone' : ''} ${running ? '' : 'fh-paused'}`}
      style={{ ['--p' as string]: 0 }}
      onKeyDown={onKeyDown}
      onTouchStart={variant === 'phone' ? onTouchStart : undefined}
      onTouchEnd={variant === 'phone' ? onTouchEnd : undefined}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHovered(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setHovered(false)}
      onFocus={(e) => e.target.matches(':focus-visible') && setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <div className="absolute inset-0">
        {mountedIdx.map((i) => {
          const s = slides[i]!;
          return (
            <Image
              key={s.id}
              src={s.src}
              alt=""
              fill
              priority={i === 0 && !pos.moved}
              sizes="100vw"
              quality={70}
              data-state={stateOf(i)}
              className="fh-img fh-layer object-cover"
              style={s.focus ? { ['--fh-pos' as string]: s.focus } : undefined}
            />
          );
        })}
      </div>

      {/* The wash sits above every photo, so text contrast is the same through the transition. */}
      <span aria-hidden className="absolute inset-0 bg-[rgba(0,0,0,0.28)]" />
      {variant === 'phone' && (
        <span
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent"
        />
      )}

      {children}

      <div
        className={`absolute inset-x-0 z-[1] ${variant === 'phone' ? 'bottom-3 px-5' : 'container-page bottom-6'}`}
      >
        <Link
          href={`/products/${slide.slug}`}
          data-testid={`hero-caption${sfx}`}
          data-on={captionOn ? 'true' : 'false'}
          aria-live="off"
          className="fh-caption mb-3 inline-flex items-center gap-2 text-[12px] uppercase tracking-[0.14em] text-ground"
        >
          <span>
            {slide.title} · {formatPrice(slide.priceCents)}
          </span>
          <ArrowRightIcon width={14} height={14} aria-hidden />
        </Link>
        <div className="flex items-center gap-3" role="group" aria-label="Featured pieces">
          <div className="flex flex-1 gap-[6px]">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => jump(i)}
                aria-label={`Show piece ${i + 1} of ${n}: ${s.title}`}
                aria-current={i === pos.cur ? 'true' : undefined}
                data-testid={`hero-segment${sfx}`}
                className="group flex h-6 flex-1 items-center"
              >
                <span className="relative block h-[2px] w-full bg-white/35">
                  <span
                    className="absolute inset-0 origin-left bg-white"
                    style={{
                      transform:
                        i < pos.cur || (i === pos.cur && reduced)
                          ? 'scaleX(1)'
                          : i === pos.cur
                            ? 'scaleX(var(--p))'
                            : 'scaleX(0)',
                    }}
                  />
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              // Pressing Play wins over a pointer that is still resting on the hero.
              if (userPaused) setHovered(false);
              setUserPaused((v) => !v);
            }}
            aria-label={userPaused ? 'Play slideshow' : 'Pause slideshow'}
            data-testid={`hero-pause${sfx}`}
            className="fh-pause flex h-6 w-6 items-center justify-center border border-white/60 text-ground"
          >
            {userPaused ? (
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden fill="currentColor">
                <path d="M2 1l7 4-7 4z" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden fill="currentColor">
                <path d="M2 1h2v8H2zM6 1h2v8H6z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
