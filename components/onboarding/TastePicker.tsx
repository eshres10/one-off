'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { morePiecesAction, stepDoneAction, togglePickAction } from '@/lib/actions/onboarding';
import type { PickerPiece } from '@/lib/services/taste';
import type { StyleTag } from '@/lib/taste/tags';
import { HeartIcon } from '@/components/ui/icons';
import { Img as Image } from '@/components/ui/Img';
import { ContinueButton, WelcomeShell } from './Shell';

export const MIN_PICKS = 5;
const HEIGHTS = [230, 200, 250, 210, 240, 220];

/** Step 3: tap the pieces you'd wear; the summary bar shows your style as it forms. */
export function TastePicker({
  initialPieces,
  initialPicks,
  initialTop,
  redo = false,
}: {
  initialPieces: PickerPiece[];
  initialPicks: string[];
  initialTop: StyleTag[];
  redo?: boolean;
}) {
  const router = useRouter();
  const [pieces, setPieces] = useState(initialPieces);
  const [shown, setShown] = useState(() => initialPieces.map((p) => p.id));
  const [picks, setPicks] = useState<string[]>(initialPicks);
  const [top, setTop] = useState<StyleTag[]>(initialTop);
  const [pending, start] = useTransition();
  const [loading, startLoading] = useTransition();
  const n = picks.length;
  const toGo = Math.max(0, MIN_PICKS - n);

  const toggle = (id: string) => {
    const on = !picks.includes(id);
    setPicks((p) => (on ? [...p, id] : p.filter((x) => x !== id)));
    start(async () => {
      const res = await togglePickAction(id, on);
      setTop(res.top);
    });
  };

  const columns: PickerPiece[][] = [[], []];
  pieces.forEach((p, i) => columns[i % 2]!.push(p));

  return (
    <WelcomeShell
      step={3}
      title="Tap the ones you’d wear"
      intro="Pick at least 5. No wrong answers."
      pinned={
        <div className="glass-light px-3 py-2.5" data-testid="taste-summary">
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span data-testid="taste-count">{n} picked</span>
            <span className="text-muted">
              {toGo > 0 ? `${toGo} more to go` : 'Great taste. Keep going or continue.'}
            </span>
          </div>
          <div className="mt-2 h-[2px] bg-line-strong" aria-hidden>
            <div
              className="h-full bg-ink motion-safe:transition-[width] motion-safe:duration-300"
              style={{ width: `${Math.min(1, n / MIN_PICKS) * 100}%` }}
            />
          </div>
          <div className="mt-2 flex min-h-[26px] items-center gap-2" aria-live="polite">
            <span className="text-[10px] uppercase tracking-label text-muted-2">Your style</span>
            {top.length ? (
              top.map((t) => (
                <span
                  key={t}
                  className="rounded-circle bg-ink px-2.5 py-0.5 text-[11px] text-ground"
                  data-testid="style-pill"
                >
                  {t}
                </span>
              ))
            ) : (
              <span className="text-[12px] text-muted-2">appears as you pick</span>
            )}
          </div>
        </div>
      }
      footer={
        <ContinueButton
          disabled={n < MIN_PICKS}
          pending={pending}
          onClick={() =>
            start(async () => {
              await stepDoneAction(3);
              router.push(redo ? '/account/style' : '/welcome?step=4');
            })
          }
        >
          {n < MIN_PICKS ? `Pick ${toGo} more` : `Continue · ${n} favourites`}
        </ContinueButton>
      }
    >
      <div className="grid grid-cols-2 gap-2" data-testid="taste-grid">
        {columns.map((col, c) => (
          <div key={c} className="flex flex-col gap-2">
            {col.map((p, i) => {
              const on = picks.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${p.title} by ${p.makerName}`}
                  onClick={() => toggle(p.id)}
                  className="group relative overflow-hidden bg-stone"
                  style={{ height: HEIGHTS[(i * 2 + c) % HEIGHTS.length] }}
                  data-testid="taste-tile"
                >
                  {p.imageUrl && (
                    <Image
                      src={p.imageUrl}
                      alt=""
                      fill
                      sizes="240px"
                      className={`object-cover object-top motion-safe:transition-transform motion-safe:duration-300 ${on ? 'scale-[1.04]' : ''}`}
                    />
                  )}
                  {on && (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_3px_var(--ink)]"
                    />
                  )}
                  <span
                    aria-hidden
                    className={`absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-circle ${on ? 'bg-ink text-ground' : 'glass-chip text-ink'}`}
                  >
                    <HeartIcon width={16} height={16} filled={on} />
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <button
        type="button"
        disabled={loading}
        onClick={() =>
          startLoading(async () => {
            const next = await morePiecesAction(shown);
            if (next.length) {
              setPieces(next);
              setShown((s) => [...s, ...next.map((p) => p.id)]);
              window.scrollTo({ top: 0 });
            }
          })
        }
        className="mt-6 min-h-[48px] w-full border border-ink text-[11px] uppercase tracking-label disabled:opacity-50"
        data-testid="more-pieces"
      >
        {loading ? 'Finding pieces…' : 'Show me different pieces'}
      </button>
    </WelcomeShell>
  );
}
