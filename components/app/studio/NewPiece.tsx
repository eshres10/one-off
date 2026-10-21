'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { savePieceAction } from '@/lib/actions/studio-listings';
import { popScreen } from '@/lib/app/nav';
import { formatPrice } from '@/lib/domain/money';
import {
  MAX_PHOTOS,
  MIN_PHOTOS,
  PIECE_CATEGORIES,
  SALE_TYPES,
  newPiece,
  publishChecklist,
  type EditorShop,
  type PieceDraft,
  type SaleType,
} from '@/lib/studio/pieces';
import { TERMS, commissionPctAt, leadOptionFor } from '@/lib/studio/terms';
import { Img as Image } from '@/components/ui/Img';
import { CameraIcon, ChevronIcon, CloseIcon, MinusIcon, PlusIcon } from '@/components/ui/icons';
import { Switch } from '@/components/studio/Switch';
import { AppButton, Chip } from '../ui';
import { toast } from '../Toast';

const SHOTS = ['Front', 'Back', 'Detail', 'On a body', 'Fabric close-up'];
const field =
  'h-12 w-full rounded-app border border-line bg-surface px-3 text-[16px] focus:border-ink focus:outline-none';

/**
 * List a piece on a phone in two steps: photos first (3–8, the first is the cover), then the
 * details. Save draft and Publish both go to Shop with a toast.
 */
export function NewPiece({ shop }: { shop: EditorShop }) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [draft, setDraft] = useState<PieceDraft>(() => newPiece(shop));
  const [shots, setShots] = useState<string[]>([]);
  const [story, setStory] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const file = useRef<HTMLInputElement>(null);
  const set = <K extends keyof PieceDraft>(k: K, v: PieceDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));
  const pct = commissionPctAt(shop.foundingUntil);
  const keep = draft.priceCents ? draft.priceCents - Math.round((draft.priceCents * pct) / 100) : 0;
  const weeks = Math.max(
    1,
    Math.min(4, Math.round(Number(/^(\d+)/.exec(draft.mtoLead ?? '')?.[1] ?? 2))),
  );

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const room = MAX_PHOTOS - draft.images.length;
    const list = Array.from(files).slice(0, room);
    setUploading((n) => n + list.length);
    for (const f of list) {
      const body = new FormData();
      body.set('kind', 'products');
      body.set('file', f);
      try {
        const res = await fetch('/api/uploads', { method: 'POST', body });
        const json = (await res.json()) as { url?: string; error?: string };
        if (!res.ok || !json.url) throw new Error(json.error ?? 'Upload failed.');
        setDraft((d) => ({ ...d, images: [...d.images, { url: json.url!, alt: '' }] }));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed.');
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }
  const move = (from: number, to: number) => {
    if (to < 0 || to >= draft.images.length) return;
    const next = [...draft.images];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m!);
    set('images', next);
  };
  const setType = (t: SaleType) => {
    setDraft((d) => ({
      ...d,
      saleType: t,
      sizes: d.sizes.map((s, i) =>
        t === 'one_of_one' ? { ...s, offered: i === 0, stock: i === 0 ? 1 : 0 } : s,
      ),
      acceptsCustom: t === 'made_to_order' ? d.acceptsCustom : false,
    }));
  };
  const toggleSize = (size: string) =>
    setDraft((d) => ({
      ...d,
      sizes: d.sizes.map((s) =>
        s.size !== size
          ? d.saleType === 'one_of_one'
            ? { ...s, offered: false, stock: 0 }
            : s
          : d.saleType === 'ready_to_ship'
            ? { ...s, offered: !s.offered, stock: s.offered ? 0 : Math.max(1, s.stock) }
            : { ...s, offered: !s.offered, stock: d.saleType === 'one_of_one' ? 1 : s.stock },
      ),
    }));
  const stock = (size: string, delta: number) =>
    setDraft((d) => ({
      ...d,
      sizes: d.sizes.map((s) =>
        s.size === size
          ? { ...s, stock: Math.max(0, s.stock + delta), offered: s.stock + delta > 0 }
          : s,
      ),
    }));

  const save = (intent: 'draft' | 'publish') =>
    start(async () => {
      setError(null);
      if (intent === 'publish' && !publishChecklist(draft).ready) {
        setError(
          publishChecklist(draft)
            .items.filter((i) => !i.done)
            .map((i) => i.label)
            .join(' · '),
        );
        return;
      }
      const res = await savePieceAction({ id: null, draft, intent });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      toast(
        intent === 'publish'
          ? res.result.live
            ? 'Live in your shop'
            : 'Saved · goes live with your shop'
          : 'Draft saved',
      );
      router.push('/studio/shop');
    });

  return (
    <div className="pb-[100px]" data-testid="new-piece">
      <div className="-mx-4 flex h-[52px] items-center justify-between px-1">
        <button
          type="button"
          onClick={() => (step === 2 ? setStep(1) : popScreen(router, '/studio/shop'))}
          aria-label="Back"
          className="flex h-11 w-11 items-center justify-center"
          data-testid="bar-back"
        >
          <ChevronIcon dir="left" width={20} height={20} strokeWidth={1.6} />
        </button>
        <span className="text-[15px]">List a piece · {step} of 2</span>
        <span className="w-11" />
      </div>

      {step === 1 ? (
        <section aria-label="Photos" data-testid="step-photos">
          <h1 className="text-[32px] leading-none">Photos first.</h1>
          <p className="mt-2 text-[13px] text-muted">
            {MIN_PHOTOS} to {MAX_PHOTOS}. The first one is the cover.
          </p>
          <ul className="mt-4 grid grid-cols-3 gap-2" role="list" data-testid="photo-grid">
            {draft.images.map((img, i) => (
              <li
                key={img.url}
                className="relative aspect-4/5 overflow-hidden rounded-app bg-stone"
                data-testid="photo-tile"
              >
                <Image src={img.url} alt="" fill sizes="33vw" className="object-cover object-top" />
                {i === 0 && (
                  <span className="absolute left-1.5 top-1.5 rounded-pill bg-ink px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-ground">
                    Cover
                  </span>
                )}
                <span className="absolute inset-x-1 bottom-1 flex justify-between">
                  <button
                    type="button"
                    onClick={() => move(i, i - 1)}
                    aria-label="Move earlier"
                    className="glass-chip flex h-8 w-8 items-center justify-center rounded-circle"
                  >
                    <ChevronIcon dir="left" width={12} height={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      set(
                        'images',
                        draft.images.filter((_, j) => j !== i),
                      )
                    }
                    aria-label="Remove photo"
                    className="glass-chip flex h-8 w-8 items-center justify-center rounded-circle"
                  >
                    <CloseIcon width={12} height={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, i + 1)}
                    aria-label="Move later"
                    className="glass-chip flex h-8 w-8 items-center justify-center rounded-circle"
                  >
                    <ChevronIcon width={12} height={12} />
                  </button>
                </span>
              </li>
            ))}
            {draft.images.length < MAX_PHOTOS && (
              <li>
                <button
                  type="button"
                  onClick={() => file.current?.click()}
                  className="flex aspect-4/5 w-full flex-col items-center justify-center gap-2 rounded-app border border-dashed border-line-strong text-[12px] text-muted"
                  data-testid="add-photos"
                >
                  <CameraIcon width={22} height={22} />
                  {uploading ? 'Uploading…' : 'Add photos'}
                </button>
                <input
                  ref={file}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  className="hidden"
                  onChange={(e) => upload(e.target.files)}
                  data-testid="photo-input"
                />
              </li>
            )}
          </ul>
          <p className="mt-5 text-[11px] uppercase tracking-label text-muted-2">
            Shots buyers look for
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SHOTS.map((s) => (
              <Chip
                key={s}
                pressed={shots.includes(s)}
                onClick={() =>
                  setShots((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s]))
                }
                small
              >
                {s}
              </Chip>
            ))}
          </div>
        </section>
      ) : (
        <section aria-label="Details" className="space-y-5" data-testid="step-details">
          <h1 className="text-[32px] leading-none">The details.</h1>
          <div>
            <label htmlFor="title" className="text-[11px] uppercase tracking-label text-muted-2">
              Name
            </label>
            <input
              id="title"
              value={draft.title}
              onChange={(e) => set('title', e.target.value)}
              className={`mt-1 ${field}`}
              data-testid="piece-title"
            />
          </div>
          <div>
            <label htmlFor="price" className="text-[11px] uppercase tracking-label text-muted-2">
              Price (A$)
            </label>
            <input
              id="price"
              type="number"
              inputMode="decimal"
              min={0}
              value={draft.priceCents ? draft.priceCents / 100 : ''}
              onChange={(e) =>
                set('priceCents', e.target.value ? Math.round(Number(e.target.value) * 100) : null)
              }
              className={`mt-1 ${field}`}
              data-testid="piece-price"
            />
            <p className="mt-1 text-[12px] text-muted" data-testid="you-keep">
              You keep {formatPrice(keep)} · {pct}% commission{pct === 0 ? ' (founding)' : ''}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-label text-muted-2">Category</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {PIECE_CATEGORIES.map((c) => (
                <Chip
                  key={c.value}
                  pressed={draft.category === c.value}
                  onClick={() => set('category', c.value)}
                  small
                  testId={`cat-${c.value}`}
                >
                  {c.label}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-label text-muted-2">How it’s sold</p>
            <div className="mt-2 flex flex-wrap gap-2" role="radiogroup">
              {SALE_TYPES.map((t) => (
                <Chip
                  key={t.value}
                  pressed={draft.saleType === t.value}
                  onClick={() => setType(t.value)}
                  testId={`type-${t.value}`}
                >
                  {t.label}
                </Chip>
              ))}
            </div>
          </div>
          <div data-testid="size-control" data-type={draft.saleType}>
            <p className="text-[11px] uppercase tracking-label text-muted-2">
              {draft.saleType === 'one_of_one'
                ? 'Its one size'
                : draft.saleType === 'ready_to_ship'
                  ? 'Sizes in stock'
                  : 'Sizes you’ll make'}
            </p>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {draft.sizes
                .filter((s) => s.size !== 'Custom')
                .map((s) => (
                  <div
                    key={s.size}
                    className={`rounded-app border p-2 text-center ${s.offered ? 'border-ink bg-ink text-ground' : 'border-line bg-surface'}`}
                  >
                    <button
                      type="button"
                      aria-pressed={s.offered}
                      onClick={() => toggleSize(s.size)}
                      className="w-full text-[14px]"
                      data-testid={`size-${s.size}`}
                    >
                      AU {s.size}
                    </button>
                    {draft.saleType === 'ready_to_ship' && s.offered && (
                      <div className="mt-1 flex items-center justify-center gap-2 text-[12px]">
                        <button
                          type="button"
                          onClick={() => stock(s.size, -1)}
                          aria-label={`Less of ${s.size}`}
                        >
                          <MinusIcon width={12} height={12} />
                        </button>
                        {s.stock}
                        <button
                          type="button"
                          onClick={() => stock(s.size, 1)}
                          aria-label={`More of ${s.size}`}
                        >
                          <PlusIcon width={12} height={12} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </div>
          {draft.saleType === 'made_to_order' && (
            <>
              <div
                className="flex items-center justify-between rounded-app bg-surface px-4 py-3"
                data-testid="making-time"
              >
                <span className="text-[14px]">Making time</span>
                <span className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => set('mtoLead', leadOptionFor((weeks - 1) * 7))}
                    aria-label="Less time"
                    className="flex h-9 w-9 items-center justify-center rounded-circle border border-line-strong"
                  >
                    <MinusIcon width={14} height={14} />
                  </button>
                  <span className="w-16 text-center text-[14px]">
                    {weeks} {weeks === 1 ? 'week' : 'weeks'}
                  </span>
                  <button
                    type="button"
                    onClick={() => set('mtoLead', leadOptionFor((weeks + 1) * 7))}
                    aria-label="More time"
                    className="flex h-9 w-9 items-center justify-center rounded-circle border border-line-strong"
                  >
                    <PlusIcon width={14} height={14} />
                  </button>
                </span>
              </div>
              <div className="flex items-center justify-between rounded-app bg-surface px-4 py-2">
                <span id="custom-label" className="text-[14px]">
                  Make to measurements
                </span>
                <Switch
                  checked={draft.acceptsCustom}
                  onChange={(v) => set('acceptsCustom', v)}
                  labelledBy="custom-label"
                  testId="measurements-switch"
                />
              </div>
            </>
          )}
          <div>
            <label
              htmlFor="description"
              className="text-[11px] uppercase tracking-label text-muted-2"
            >
              Description
            </label>
            <textarea
              id="description"
              rows={4}
              value={draft.description}
              onChange={(e) => set('description', e.target.value)}
              className="mt-1 w-full rounded-app border border-line bg-surface px-3 py-2 text-[16px] focus:border-ink focus:outline-none"
              data-testid="piece-description"
            />
            <p className="mt-1 text-[11px] text-muted-2">
              {Math.max(0, 80 - draft.description.trim().length)} more characters to go
            </p>
          </div>
          <div className="rounded-app bg-surface px-4 py-2">
            <div className="flex items-center justify-between">
              <span id="story-label" className="text-[14px]">
                Story of the garment
              </span>
              <Switch
                checked={story}
                onChange={setStory}
                labelledBy="story-label"
                testId="story-switch"
              />
            </div>
            {story && (
              <div className="mt-3 space-y-3" data-testid="story-fields">
                <input
                  placeholder="Their line, in a few words"
                  value={draft.story.quote}
                  onChange={(e) => set('story', { ...draft.story, quote: e.target.value })}
                  className={field}
                />
                <textarea
                  rows={3}
                  placeholder="What inspired it, how it’s made"
                  value={draft.story.inspiration}
                  onChange={(e) => set('story', { ...draft.story, inspiration: e.target.value })}
                  className="w-full rounded-app border border-line bg-surface px-3 py-2 text-[16px] focus:border-ink focus:outline-none"
                />
                <input
                  placeholder="The fabric"
                  value={draft.story.fabric}
                  onChange={(e) => set('story', { ...draft.story, fabric: e.target.value })}
                  className={field}
                />
              </div>
            )}
          </div>
        </section>
      )}

      {error && (
        <p
          className="mt-4 rounded-app bg-error-bg px-3 py-2 text-[13px] text-error"
          role="alert"
          data-testid="piece-error"
        >
          {error}
        </p>
      )}

      <div className="glass-nav fixed inset-x-0 bottom-0 z-40 flex gap-2 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 md:hidden">
        {step === 1 ? (
          <AppButton
            onClick={() => setStep(2)}
            disabled={draft.images.length < MIN_PHOTOS || uploading > 0}
            className="w-full"
            data-testid="to-details"
          >
            {draft.images.length < MIN_PHOTOS
              ? `Add ${MIN_PHOTOS - draft.images.length} more photo${MIN_PHOTOS - draft.images.length === 1 ? '' : 's'}`
              : 'Next · details'}
          </AppButton>
        ) : (
          <>
            <AppButton
              variant="outline"
              onClick={() => save('draft')}
              disabled={pending}
              className="flex-1"
              data-testid="save-draft"
            >
              Save draft
            </AppButton>
            <AppButton
              onClick={() => save('publish')}
              disabled={pending}
              className="flex-[1.3]"
              data-testid="publish"
            >
              {pending ? 'Saving…' : 'Publish'}
            </AppButton>
          </>
        )}
      </div>
      <span className="sr-only">{TERMS.sizes.length} sizes</span>
    </div>
  );
}
