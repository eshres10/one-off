'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { addToBagAction } from '@/lib/actions/cart';
import { formatPrice } from '@/lib/domain/money';
import { useLongPress } from '@/lib/hooks/useLongPress';
import { Pill } from '@/components/ui/Pill';

interface QuickAddData {
  id: string;
  slug: string;
  title: string;
  priceCents: number;
  imageUrl: string | null;
  makerName: string;
  multiColour: boolean;
  variants: Array<{ id: string; size: string; colour: string | null; available: boolean }>;
  canBuy: boolean;
  reason: string | null;
}

type Phase = 'loading' | 'choose' | 'adding' | 'added' | 'error';

/**
 * Press and hold a piece in any listing to add it to the bag. A piece with one size in stock goes
 * straight in; otherwise a small sheet asks for the size. Taps still open the piece as before.
 */
export function LongPressAdd({ slug, children }: { slug: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { pressing, handlers } = useLongPress(() => setOpen(true));
  return (
    <>
      <div
        {...handlers}
        data-long-press-add={slug}
        className={`select-none transition-transform duration-300 [-webkit-touch-callout:none] ${pressing ? 'scale-[0.97]' : ''}`}
      >
        {children}
      </div>
      {open && <QuickAddSheet slug={slug} onClose={() => setOpen(false)} />}
    </>
  );
}

function QuickAddSheet({ slug, onClose }: { slug: string; onClose: () => void }) {
  const router = useRouter();
  const [data, setData] = useState<QuickAddData | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [message, setMessage] = useState<string | null>(null);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [, start] = useTransition();
  const panel = useRef<HTMLDivElement>(null);

  const add = (d: QuickAddData, id: string) => {
    setPhase('adding');
    start(async () => {
      const form = new FormData();
      form.set('productId', d.id);
      form.set('variantId', id);
      form.set('quantity', '1');
      const res = await addToBagAction(undefined, form);
      if (res?.ok) {
        setPhase('added');
        router.refresh();
      } else {
        setMessage(res?.message ?? 'That didn’t work. Please try again.');
        setPhase('error');
      }
    });
  };

  useEffect(() => {
    let live = true;
    fetch(`/api/quick-add/${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? (r.json() as Promise<QuickAddData>) : Promise.reject()))
      .then((d) => {
        if (!live) return;
        setData(d);
        const inStock = d.variants.filter((v) => v.available);
        if (d.canBuy && inStock.length === 1) {
          setVariantId(inStock[0]!.id);
          add(d, inStock[0]!.id);
        } else setPhase('choose');
      })
      .catch(() => {
        if (!live) return;
        setMessage('We couldn’t load this piece.');
        setPhase('error');
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    panel.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Added: close on its own after a moment.
  useEffect(() => {
    if (phase !== 'added') return;
    const t = setTimeout(onClose, 2600);
    return () => clearTimeout(t);
  }, [phase, onClose]);

  const allGone = data && !data.variants.some((v) => v.available);
  const size = (v: QuickAddData['variants'][number]) => v.size.replace(/^AU\s*/i, '');
  // Several colours: sizes are grouped under each colour.
  const groups: Array<[string | null, QuickAddData['variants']]> = [];
  for (const v of data?.variants ?? []) {
    const key = data?.multiColour ? v.colour : null;
    const g = groups.find(([c]) => c === key);
    if (g) g[1].push(v);
    else groups.push([key, [v]]);
  }

  return createPortal(
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Add to bag">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-[rgba(17,17,17,0.32)]"
      />
      <div
        ref={panel}
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto border-t border-line bg-ground px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-5 shadow-[0_-12px_40px_rgba(17,17,17,0.12)] outline-none md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-[420px] md:-translate-x-1/2 md:-translate-y-1/2"
        data-testid="quick-add"
      >
        <div className="flex items-start gap-3">
          <span className="relative aspect-4/5 w-14 shrink-0 overflow-hidden bg-stone">
            {data?.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.imageUrl} alt="" className="h-full w-full object-cover" />
            )}
          </span>
          <div className="min-w-0 flex-1 text-[13px]">
            <p className="truncate text-[15px]">{data?.title ?? ' '}</p>
            <p className="text-muted">
              {data ? `${data.makerName} · ${formatPrice(data.priceCents)}` : 'Loading…'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 -mt-2 flex h-11 w-11 items-center justify-center text-[22px]"
          >
            ×
          </button>
        </div>

        {phase === 'added' ? (
          <div className="mt-5" role="status" data-testid="quick-add-done">
            <p className="font-display text-[28px] leading-none">Added to your bag.</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[48px] border border-ink text-[11px] uppercase tracking-[0.18em]"
              >
                Keep looking
              </button>
              <Link
                href="/bag"
                onClick={onClose}
                className="glass-dark flex min-h-[48px] items-center justify-center text-[11px] uppercase tracking-[0.18em] text-ground"
              >
                View bag
              </Link>
            </div>
          </div>
        ) : phase === 'error' ? (
          <p className="mt-5 text-[14px] text-error" role="alert">
            {message}
          </p>
        ) : data && !data.canBuy ? (
          <div className="mt-5 text-[14px]" data-testid="quick-add-unavailable">
            <p>{data.reason}</p>
            <Link
              href={`/products/${data.slug}`}
              onClick={onClose}
              className="mt-4 inline-block underline underline-offset-[3px]"
            >
              See the piece
            </Link>
          </div>
        ) : data && (allGone || !data.variants.length) ? (
          <div className="mt-5 text-[14px]">
            <p>{allGone ? 'Sold out in every size.' : 'Choose your measurements on the piece.'}</p>
            <Link
              href={`/products/${data.slug}`}
              onClick={onClose}
              className="mt-4 inline-block underline underline-offset-[3px]"
            >
              See the piece
            </Link>
          </div>
        ) : (
          <fieldset className="mt-5" disabled={!data || phase === 'adding'}>
            <legend className="text-[11px] uppercase tracking-label">Size</legend>
            {groups.map(([colour, vs]) => (
              <div key={colour ?? 'all'} className="mt-2">
                {colour && <p className="mb-1.5 text-[12px] text-muted">{colour}</p>}
                <div className="flex flex-wrap gap-1.5">
                  {vs.map((v) => (
                    <Pill
                      key={v.id}
                      pressed={variantId === v.id}
                      soldOut={!v.available}
                      onClick={() => setVariantId(v.id)}
                      aria-label={`Size ${size(v)}${colour ? `, ${colour}` : ''}${v.available ? '' : ', sold out'}`}
                      data-testid="quick-add-size"
                    >
                      {size(v)}
                    </Pill>
                  ))}
                </div>
              </div>
            ))}
            <button
              type="button"
              disabled={!variantId || phase === 'adding'}
              onClick={() => data && variantId && add(data, variantId)}
              className="glass-dark mt-5 min-h-[52px] w-full text-[11px] uppercase tracking-[0.2em] text-ground disabled:opacity-50"
              data-testid="quick-add-submit"
            >
              {phase === 'adding' ? 'Adding…' : variantId ? 'Add to bag' : 'Select a size'}
            </button>
          </fieldset>
        )}
      </div>
    </div>,
    document.body,
  );
}
