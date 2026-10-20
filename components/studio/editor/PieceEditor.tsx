'use client';

import { MAX_STYLE_TAGS, STYLE_TAGS } from '@/lib/taste/tags';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { savePieceAction } from '@/lib/actions/studio-listings';
import { COLOURS } from '@/lib/discover/params';
import { estimateDelivery } from '@/lib/domain/leadTime';
import { formatPrice } from '@/lib/domain/money';
import {
  MAX_PHOTOS,
  MIN_DESCRIPTION,
  MIN_PHOTOS,
  PIECE_CATEGORIES,
  PIECE_OCCASIONS,
  SALE_TYPES,
  publishChecklist,
  type EditorPiece,
  type EditorShop,
  type PieceDraft,
  type SaleType,
} from '@/lib/studio/pieces';
import { TERMS, commissionPctAt, leadDaysFor, processingEstimateCents } from '@/lib/studio/terms';
import { showToast } from '@/lib/studio/toast';
import { ArrowLeftIcon, CheckIcon, CloseIcon, MinusIcon, PlusIcon } from '@/components/ui/icons';
import { Img as Image } from '@/components/ui/Img';
import { Sheet } from '../Sheet';
import { StorySection } from './StorySection';
import { hasStory, storyPrompts } from '@/lib/listings/story';
import { Switch } from '../Switch';

const STEPS = ['Photos', 'Details', 'The story', 'Sizes & price', 'Check it'] as const;
const STORY_STEP = 2;
const SIZES_STEP = 3;
const CHECK_STEP = 4;

function Chip({
  on,
  onClick,
  children,
  role = 'checkbox',
  testId,
  disabled = false,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  role?: 'checkbox' | 'radio';
  testId?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={on}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={`min-h-[40px] rounded-circle border px-4 text-[12px] disabled:cursor-not-allowed disabled:opacity-40 ${on ? 'border-ink bg-ink text-ground' : 'border-line-strong hover:border-ink'}`}
    >
      {children}
    </button>
  );
}

function Section({
  id,
  title,
  children,
  className = '',
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={`${id}-title`}
      className={`border-t border-line py-7 first:border-t-0 ${className}`}
    >
      <h2 id={`${id}-title`} className="mb-4 text-[26px] leading-none">
        {title}
      </h2>
      {children}
    </section>
  );
}

const savedLabel = (at: number | null, now: number) => {
  if (!at) return 'not saved yet';
  const s = Math.round((now - at) / 1000);
  if (s < 10) return 'saved just now';
  if (s < 60) return `saved ${s}s ago`;
  return `saved ${Math.round(s / 60)} min ago`;
};

/**
 * Add / edit a piece. Desktop: the form on the left, a sticky preview card and checklist on the
 * right, autosaving as you go. Phones: five steps (Photos, Details, The story, Sizes & price, Check it).
 * `mode="admin"` is Off One listing into a draft shop; `embedded` drops the page chrome so it
 * can sit in a sheet (the claim flow's "Edit details").
 */
export function PieceEditor({
  initial,
  shop,
  priceHints,
  mode = 'seller',
  embedded = false,
  backHref = '/studio/listings',
  onSaved,
}: {
  initial: EditorPiece;
  shop: EditorShop;
  priceHints: Record<string, { low: number; high: number } | null>;
  mode?: 'seller' | 'admin';
  embedded?: boolean;
  backHref?: string;
  onSaved?: () => void;
}) {
  const [draft, setDraft] = useState<PieceDraft>(initial);
  const [id, setId] = useState(initial.id);
  const [slug, setSlug] = useState(initial.slug);
  const [status, setStatus] = useState(initial.status);
  const [savedAt, setSavedAt] = useState<number | null>(initial.id ? Date.now() : null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const [step, setStep] = useState(0);
  const [uploading, setUploading] = useState(0);
  const [measuresOpen, setMeasuresOpen] = useState(false);
  const [published, setPublished] = useState(false);
  const [shopLive, setShopLive] = useState(shop.shopLive);
  useEffect(() => {
    if (!initial.id) return;
    try {
      const key = `piece-published:${initial.id}`;
      if (sessionStorage.getItem(key)) {
        sessionStorage.removeItem(key);
        setPublished(true);
      }
    } catch {
      // Storage blocked: show the editor.
    }
  }, [initial.id]);
  const [now, setNow] = useState(Date.now());
  const fileInput = useRef<HTMLInputElement>(null);
  const dragFrom = useRef<number | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout>>();

  const live = status === 'approved';
  // Close-ups alone still make a story, but they don't count towards the prompts.
  const storyAdded = hasStory(draft.story);
  const storyCount = storyPrompts(draft.story);
  const check = useMemo(() => publishChecklist(draft), [draft]);
  const update = (patch: Partial<PieceDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  // Saves run one at a time, so an autosave and a publish never both create a new piece.
  const idRef = useRef(id);
  idRef.current = id ?? idRef.current;
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const save = useCallback(
    (intent: 'autosave' | 'draft' | 'publish') => {
      const run = queue.current.then(
        () =>
          new Promise<boolean>((resolve) =>
            start(async () => {
              const res = await savePieceAction({
                id: idRef.current,
                makerId: mode === 'admin' ? shop.makerId : undefined,
                draft,
                intent,
              });
              if (!res.ok) {
                setError(res.message);
                resolve(false);
                return;
              }
              setError(null);
              setDirty(false);
              setSavedAt(Date.now());
              setStatus(res.result.status);
              setSlug(res.result.slug);
              setShopLive(res.result.shopLive);
              // This piece took an approved shop live: show the "You're live" screen.
              if (res.result.wentLive && mode !== 'admin') {
                window.location.assign('/studio/setup?live=1');
                resolve(true);
                return;
              }
              if (!idRef.current) {
                idRef.current = res.result.id;
                setId(res.result.id);
                // Address the new piece without remounting the editor (keeps the success screen).
                if (!embedded)
                  window.history.replaceState(
                    null,
                    '',
                    mode === 'admin'
                      ? `/admin/shops/${shop.makerId}/pieces/${res.result.id}`
                      : `/studio/listings/${res.result.id}`,
                  );
              }
              resolve(true);
            }),
          ),
      );
      queue.current = run.catch(() => undefined);
      return run;
    },
    [draft, mode, shop.makerId, embedded],
  );

  // Autosave: drafts always; a live piece only while it still passes the checklist.
  useEffect(() => {
    if (!dirty || embedded) return;
    if (!id && !draft.title.trim() && draft.images.length === 0) return;
    if (live && !check.ready) return;
    const t = setTimeout(() => void save('autosave'), 1200);
    return () => clearTimeout(t);
  }, [dirty, draft, id, live, check.ready, embedded, save]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const room = MAX_PHOTOS - draft.images.length;
    const list = Array.from(files).slice(0, room);
    if (files.length > room) setError(`Up to ${MAX_PHOTOS} photos.`);
    setUploading((n) => n + list.length);
    for (const file of list) {
      const body = new FormData();
      body.set('kind', 'products');
      body.set('file', file);
      try {
        const res = await fetch('/api/uploads', { method: 'POST', body });
        const json = (await res.json()) as { url?: string; error?: string };
        if (!res.ok || !json.url) throw new Error(json.error ?? 'Upload failed.');
        setDraft((d) => ({ ...d, images: [...d.images, { url: json.url!, alt: '' }] }));
        setDirty(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed.');
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  const movePhoto = (from: number, to: number) => {
    if (to < 0 || to >= draft.images.length || from === to) return;
    const images = [...draft.images];
    const [m] = images.splice(from, 1);
    images.splice(to, 0, m!);
    update({ images });
  };

  const setSize = (size: string, patch: Partial<{ stock: number; offered: boolean }>) =>
    update({
      sizes: draft.sizes.map((s) => {
        if (s.size === size) return { ...s, ...patch };
        // One of one: only one size can be on.
        if (draft.saleType === 'one_of_one' && patch.offered) return { ...s, offered: false };
        return s;
      }),
    });

  const pct = commissionPctAt(shop.foundingUntil);
  const price = draft.priceCents ?? 0;
  const commission = Math.round((price * pct) / 100);
  const processing = price ? processingEstimateCents(price) : 0;
  const hint = priceHints[draft.category] ?? null;
  const est = useMemo(() => {
    try {
      return estimateDelivery({
        productType: draft.saleType,
        leadTimeDays: draft.saleType === 'made_to_order' ? leadDaysFor(draft.mtoLead) : null,
        dispatchDays: shop.dispatchDays,
      });
    } catch {
      return null;
    }
  }, [draft.saleType, draft.mtoLead, shop.dispatchDays]);
  const day = (d: Date) =>
    d.toLocaleDateString('en-AU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
  const timing = est
    ? draft.saleType === 'made_to_order'
      ? `Made in ${draft.mtoLead ?? '2 weeks'} · Delivery ${day(est.deliveryTo)}`
      : `Ships in ${shop.dispatchDays === 0 ? 'a day' : `${shop.dispatchDays} days`} · Delivery ${day(est.deliveryTo)}`
    : '';
  const saleLabel = SALE_TYPES.find((t) => t.value === draft.saleType)!.label;

  async function publish() {
    if (await save('publish')) {
      if (embedded) {
        onSaved?.();
        return;
      }
      if (mode === 'admin') {
        showToast('Saved to the shop. It goes live when the maker does.');
        return;
      }
      // A refresh after saving can remount the editor at its new address; keep the success screen.
      try {
        sessionStorage.setItem(`piece-published:${idRef.current}`, '1');
      } catch {
        // Storage blocked: the screen still shows until the next remount.
      }
      setPublished(true);
    }
  }

  const stepClass = (k: number) => (embedded ? '' : step === k ? '' : 'hidden md:block');

  if (published && slug) {
    return (
      <div className="mx-auto max-w-md py-16 text-center" data-testid="piece-live">
        <p className="text-[11px] uppercase tracking-label text-muted-2">{shop.name}</p>
        <h1 className="mt-3 text-[56px] leading-none">
          {status === 'approved' ? (shopLive ? 'It’s live' : 'Published') : 'Ready to go'}
        </h1>
        <p className="mt-3 text-[14px] text-muted">
          {status === 'approved'
            ? shopLive
              ? `${draft.title} is in your shop now.`
              : `${draft.title} shows in your shop once your shop goes live.`
            : `${draft.title} goes live with your shop.`}
        </p>
        {status === 'approved' && !shopLive && (
          <a href="/studio/setup" className="link mt-3 inline-block text-[13px]">
            Finish setting up
          </a>
        )}
        {draft.images[0] && (
          <div className="relative mx-auto mt-8 aspect-4/5 w-48 overflow-hidden bg-stone">
            <Image src={draft.images[0].url} alt="" fill sizes="192px" className="object-cover" />
          </div>
        )}
        <div className="mt-8 grid gap-2">
          <a
            href={`/api/story?product=${encodeURIComponent(id ?? '')}`}
            className="glass-dark flex min-h-[52px] items-center justify-center text-[11px] uppercase tracking-[0.18em]"
            data-testid="share-story"
          >
            Share to Story
          </a>
          <a
            href="/studio/listings/new"
            className="flex min-h-[52px] items-center justify-center border border-ink text-[11px] uppercase tracking-[0.18em]"
          >
            Add another piece
          </a>
          {status === 'approved' && shopLive && (
            <a href={`/products/${slug}`} className="link mt-2 text-[13px]">
              See it in your shop
            </a>
          )}
        </div>
      </div>
    );
  }

  const photos = (
    <Section id="photos" title="Photos" className={stepClass(0)}>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="list" data-testid="photo-grid">
        {draft.images.map((img, i) => (
          <li
            key={img.url}
            draggable
            onDragStart={() => (dragFrom.current = i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragFrom.current !== null) movePhoto(dragFrom.current, i);
              dragFrom.current = null;
            }}
            className="group relative aspect-4/5 cursor-grab overflow-hidden bg-stone"
          >
            <Image
              src={img.url}
              alt={img.alt || `Photo ${i + 1}`}
              fill
              sizes="200px"
              className="object-cover"
            />
            {i === 0 && (
              <span className="absolute left-1.5 top-1.5 bg-ink px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em] text-ground">
                Cover
              </span>
            )}
            <div className="absolute inset-x-0 bottom-0 flex justify-between bg-gradient-to-t from-black/50 to-transparent p-1 text-ground">
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center disabled:opacity-30"
                onClick={() => movePhoto(i, i - 1)}
                disabled={i === 0}
                aria-label={`Move photo ${i + 1} earlier`}
              >
                <ArrowLeftIcon width={14} height={14} />
              </button>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center"
                onClick={() => update({ images: draft.images.filter((_, k) => k !== i) })}
                aria-label={`Remove photo ${i + 1}`}
              >
                <CloseIcon width={14} height={14} />
              </button>
              <button
                type="button"
                className="flex h-9 w-9 rotate-180 items-center justify-center disabled:opacity-30"
                onClick={() => movePhoto(i, i + 1)}
                disabled={i === draft.images.length - 1}
                aria-label={`Move photo ${i + 1} later`}
              >
                <ArrowLeftIcon width={14} height={14} />
              </button>
            </div>
          </li>
        ))}
        {Array.from({ length: uploading }, (_, i) => (
          <li key={`up-${i}`} className="skeleton aspect-4/5" aria-label="Uploading" />
        ))}
        {draft.images.length + uploading < MAX_PHOTOS && (
          <li>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex aspect-4/5 w-full flex-col items-center justify-center gap-2 border border-dashed border-line-strong text-[12px] text-muted hover:border-ink"
              data-testid="add-photos"
            >
              <PlusIcon width={18} height={18} />
              Add photos
            </button>
          </li>
        )}
      </ul>
      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="sr-only"
        aria-label="Choose photos"
        data-testid="photo-input"
        onChange={(e) => {
          void upload(e.target.files);
          e.target.value = '';
        }}
      />
      <p className="mt-3 text-[12px] text-muted">
        {draft.images.length}/{MAX_PHOTOS}. Drag to reorder; the first is the cover. Tip: daylight,
        a plain wall, one photo worn, and one close up of the fabric.
      </p>
    </Section>
  );

  const basics = (
    <Section id="basics" title="Basics" className={stepClass(1)}>
      <div className="space-y-5">
        <div>
          <label htmlFor="piece-title" className="label">
            Name
          </label>
          <input
            id="piece-title"
            className="input"
            value={draft.title}
            maxLength={120}
            placeholder="Butter silk slip"
            onChange={(e) => update({ title: e.target.value })}
            data-testid="piece-title"
          />
        </div>
        <fieldset>
          <legend className="label">Category</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Category">
            {PIECE_CATEGORIES.map((c) => (
              <Chip
                key={c.value}
                role="radio"
                on={draft.category === c.value}
                onClick={() => update({ category: c.value })}
                testId={`cat-${c.value}`}
              >
                {c.label}
              </Chip>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="piece-description" className="label">
            Description
          </label>
          <textarea
            id="piece-description"
            className="input min-h-[140px]"
            value={draft.description}
            maxLength={4000}
            placeholder="How it fits, how it feels, what makes it yours. Fit notes help most."
            onChange={(e) => update({ description: e.target.value })}
            aria-describedby="piece-description-count"
            data-testid="piece-description"
          />
          <p id="piece-description-count" className="mt-1 text-[12px] text-muted">
            {draft.description.trim().length} characters · 150+ works best
            {draft.description.trim().length < MIN_DESCRIPTION
              ? ` (at least ${MIN_DESCRIPTION} to publish)`
              : ''}
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="piece-fabric" className="label">
              Fabric
            </label>
            <input
              id="piece-fabric"
              className="input"
              value={draft.fabric}
              placeholder="100% silk satin"
              onChange={(e) => update({ fabric: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="piece-care" className="label">
              Care
            </label>
            <input
              id="piece-care"
              className="input"
              value={draft.care}
              placeholder="Hand wash cold"
              onChange={(e) => update({ care: e.target.value })}
            />
          </div>
        </div>
        <fieldset>
          <legend className="label">Occasions</legend>
          <div className="flex flex-wrap gap-2">
            {PIECE_OCCASIONS.map((o) => {
              const on = draft.occasions.includes(o.toLowerCase());
              return (
                <Chip
                  key={o}
                  on={on}
                  onClick={() =>
                    update({
                      occasions: on
                        ? draft.occasions.filter((x) => x !== o.toLowerCase())
                        : [...draft.occasions, o.toLowerCase()],
                    })
                  }
                >
                  {o}
                </Chip>
              );
            })}
          </div>
        </fieldset>
        <fieldset data-testid="style-tags">
          <legend className="label">
            Style <span className="text-muted-2">— up to {MAX_STYLE_TAGS}</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {STYLE_TAGS.map((t) => {
              const on = draft.styleTags.includes(t);
              const full = !on && draft.styleTags.length >= MAX_STYLE_TAGS;
              return (
                <Chip
                  key={t}
                  on={on}
                  disabled={full}
                  onClick={() =>
                    update({
                      styleTags: on
                        ? draft.styleTags.filter((x) => x !== t)
                        : [...draft.styleTags, t],
                    })
                  }
                >
                  {t}
                </Chip>
              );
            })}
          </div>
        </fieldset>
        <fieldset>
          <legend className="label">
            Colour
            {draft.colours.length ? (
              <span className="text-muted-2"> — {draft.colours.join(', ')}</span>
            ) : null}
          </legend>
          <div className="flex flex-wrap gap-2">
            {COLOURS.map((c) => {
              const on = draft.colours.includes(c.label);
              return (
                <button
                  key={c.value}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  aria-label={c.label}
                  title={c.label}
                  onClick={() =>
                    update({
                      colours: on
                        ? draft.colours.filter((x) => x !== c.label)
                        : [...draft.colours, c.label],
                    })
                  }
                  className={`flex h-11 w-11 items-center justify-center rounded-circle ${on ? 'ring-2 ring-ink' : ''}`}
                >
                  <span
                    aria-hidden
                    className="h-8 w-8 rounded-circle border border-line-strong"
                    style={{ background: c.hex }}
                  />
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>
    </Section>
  );

  const sold = (
    <Section id="sold" title="How it’s sold" className={stepClass(1)}>
      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="How it’s sold">
        {SALE_TYPES.map((t) => {
          const on = draft.saleType === t.value;
          return (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={on}
              data-testid={`sale-${t.value}`}
              onClick={() => {
                const saleType = t.value as SaleType;
                let sizes = draft.sizes;
                if (saleType === 'one_of_one') {
                  const first = sizes.find((s) => s.offered || s.stock > 0);
                  sizes = sizes.map((s) => ({ ...s, offered: s.size === first?.size, stock: 0 }));
                }
                update({ saleType, sizes });
              }}
              className={`min-h-[104px] border p-4 text-left ${on ? 'border-ink bg-surface outline outline-1 outline-ink' : 'border-line-strong hover:border-ink'}`}
            >
              <span className="block text-[14px]">{t.label}</span>
              <span className="mt-1 block text-[12px] text-muted">{t.blurb}</span>
            </button>
          );
        })}
      </div>
      {draft.saleType === 'made_to_order' && (
        <div className="mt-5 space-y-5">
          <fieldset>
            <legend className="label">Making time</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Making time">
              {TERMS.mtoLeadOptions.map((l) => (
                <Chip
                  key={l}
                  role="radio"
                  on={draft.mtoLead === l}
                  onClick={() => update({ mtoLead: l })}
                >
                  {l}
                </Chip>
              ))}
            </div>
          </fieldset>
          <div className="max-w-xs">
            <label htmlFor="piece-capacity" className="label">
              Orders you can take at once
            </label>
            <input
              id="piece-capacity"
              type="number"
              min={1}
              max={500}
              inputMode="numeric"
              className="input"
              value={draft.mtoCapacity ?? ''}
              onChange={(e) =>
                update({ mtoCapacity: e.target.value ? Number(e.target.value) : null })
              }
            />
            <p className="mt-1 text-[12px] text-muted">
              When you hit your limit the piece shows “Next slot: …” instead of selling out.
            </p>
          </div>
        </div>
      )}
    </Section>
  );

  const sizes = (
    <Section id="sizes" title="Sizes" className={stepClass(SIZES_STEP)}>
      <ul
        className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7"
        role="list"
        data-testid="size-tiles"
      >
        {draft.sizes.map((s) => {
          const customOff = s.size === 'Custom' && draft.saleType !== 'made_to_order';
          return (
            <li
              key={s.size}
              className={`border p-2 text-center ${customOff ? 'border-dashed border-line text-muted-2' : 'border-line-strong'}`}
            >
              <span className="block text-[13px]">
                {s.size === 'Custom' ? 'Custom' : `AU ${s.size}`}
              </span>
              {draft.saleType === 'ready_to_ship' ? (
                <div
                  className="mt-1 flex items-center justify-center"
                  role="group"
                  aria-label={`Size ${s.size} stock`}
                >
                  {customOff ? (
                    <span className="py-2.5 text-[11px]">Made to order only</span>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="flex h-10 w-10 items-center justify-center disabled:opacity-30"
                        aria-label={`One fewer in size ${s.size}`}
                        disabled={s.stock <= 0}
                        onClick={() => setSize(s.size, { stock: Math.max(0, s.stock - 1) })}
                        onPointerDown={() => {
                          holdTimer.current = setTimeout(() => setSize(s.size, { stock: 0 }), 650);
                        }}
                        onPointerUp={() => clearTimeout(holdTimer.current)}
                        onPointerLeave={() => clearTimeout(holdTimer.current)}
                        onContextMenu={(e) => e.preventDefault()}
                      >
                        <MinusIcon width={13} height={13} />
                      </button>
                      <output
                        className="w-6 text-[14px] tabular-nums"
                        data-testid={`size-${s.size}-stock`}
                      >
                        {s.stock}
                      </output>
                      <button
                        type="button"
                        className="flex h-10 w-10 items-center justify-center"
                        aria-label={`One more in size ${s.size}`}
                        onClick={() => setSize(s.size, { stock: Math.min(999, s.stock + 1) })}
                        data-testid={`size-${s.size}-plus`}
                      >
                        <PlusIcon width={13} height={13} />
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="mt-2 flex justify-center">
                  {customOff ? (
                    <span className="py-2.5 text-[11px]">Made to order only</span>
                  ) : (
                    <Switch
                      checked={s.offered}
                      onChange={(v) => setSize(s.size, { offered: v })}
                      label={`Offer size ${s.size}`}
                      testId={`size-${s.size}-switch`}
                    />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[12px] text-muted">
        {draft.saleType === 'ready_to_ship'
          ? 'Tap + for each one you have. Long-press − to clear a size.'
          : draft.saleType === 'made_to_order'
            ? 'Turn on the sizes you make. Custom lets buyers give their measurements at checkout.'
            : 'Choose the one size this piece is.'}
      </p>
      <button
        type="button"
        className="mt-3 min-h-[44px] text-[13px] underline underline-offset-4"
        onClick={() => setMeasuresOpen(true)}
      >
        {draft.measurements.length
          ? `Garment measurements (${draft.measurements.length}) →`
          : 'Add garment measurements →'}
      </button>
    </Section>
  );

  const priceSection = (
    <Section id="price" title="Price" className={stepClass(SIZES_STEP)}>
      <div className="grid gap-6 sm:grid-cols-[200px_1fr]">
        <div>
          <label htmlFor="piece-price" className="label">
            Price (A$)
          </label>
          <input
            id="piece-price"
            type="number"
            inputMode="decimal"
            min={1}
            step={1}
            className="input text-[18px]"
            value={draft.priceCents ? draft.priceCents / 100 : ''}
            onChange={(e) =>
              update({
                priceCents: e.target.value ? Math.round(Number(e.target.value) * 100) : null,
              })
            }
            data-testid="piece-price"
          />
          {hint && (
            <p className="mt-2 text-[12px] text-muted">
              Similar{' '}
              {PIECE_CATEGORIES.find((c) => c.value === draft.category)?.label.toLowerCase() ??
                'pieces'}{' '}
              on Off One sell for {formatPrice(hint.low)}–{formatPrice(hint.high)}.
            </p>
          )}
        </div>
        <dl className="space-y-1.5 bg-stone p-4 text-[13px]" data-testid="price-breakdown">
          <div className="flex justify-between">
            <dt>Price</dt>
            <dd>{formatPrice(price)}</dd>
          </div>
          <div className="flex justify-between text-muted">
            <dt>
              Commission ({pct}%
              {pct === TERMS.foundingCommissionPct && shop.foundingUntil ? ', founding maker' : ''})
            </dt>
            <dd>−{formatPrice(commission)}</dd>
          </div>
          <div className="flex justify-between text-muted">
            <dt>Card processing (about 1.75% + 30c)</dt>
            <dd>−{formatPrice(processing)}</dd>
          </div>
          <div className="flex justify-between border-t border-line-strong pt-2 font-display text-[22px]">
            <dt>You get per sale</dt>
            <dd data-testid="you-get">
              {formatPrice(Math.max(0, price - commission - processing))}
            </dd>
          </div>
          <p className="pt-1 text-[11px] text-muted-2">
            Shipping is paid to you on top, commission-free.
          </p>
        </dl>
      </div>
    </Section>
  );

  const shipping = (
    <Section id="shipping" title="Shipping & requests" className={stepClass(SIZES_STEP)}>
      <p className="text-[13px]">
        {shop.ratesSummary}{' '}
        <Link href="/studio/settings#shipping" className="link">
          Change
        </Link>
      </p>
      <div className="mt-4 flex items-center justify-between gap-4 border-t border-line pt-4">
        <span className="text-[13px]" id="custom-label">
          Accept custom requests on this piece
          <span className="block text-[12px] text-muted">
            Buyers can ask for a version made for them.
          </span>
        </span>
        <Switch
          checked={draft.acceptsCustom}
          onChange={(v) => update({ acceptsCustom: v })}
          labelledBy="custom-label"
        />
      </div>
    </Section>
  );

  const checklist = (
    <div className="border border-line bg-surface p-4" data-testid="publish-checklist">
      <p className="text-[11px] uppercase tracking-label text-muted-2">
        Ready to publish · {check.passed}/{check.items.length}
      </p>
      <ul className="mt-3 space-y-1.5" role="list">
        {check.items.map((i) => (
          <li
            key={i.key}
            className={`flex items-center gap-2 text-[13px] ${i.done ? 'text-muted-2' : ''}`}
          >
            <span
              aria-hidden
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-circle border ${i.done ? 'border-ink bg-ink text-ground' : 'border-line-strong'}`}
            >
              {i.done && <CheckIcon width={10} height={10} />}
            </span>
            {i.label}
            <span className="sr-only">{i.done ? ' (done)' : ' (to do)'}</span>
          </li>
        ))}
      </ul>
      {/* The story never counts towards publishing. */}
      <p
        className={`mt-3 flex items-center gap-2 border-t border-line pt-3 text-[13px] ${storyAdded ? 'text-muted-2' : 'text-muted'}`}
        data-testid="checklist-story"
      >
        <span
          aria-hidden
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-circle border ${storyAdded ? 'border-ink bg-ink text-ground' : 'border-dashed border-line-strong'}`}
        >
          {storyAdded && <CheckIcon width={10} height={10} />}
        </span>
        {storyAdded
          ? `Story added · ${storyCount} of 5 prompts`
          : 'Story of the garment · optional'}
      </p>
    </div>
  );

  const preview = (
    <div className="border border-line bg-surface" data-testid="piece-preview">
      <div className="relative aspect-4/5 overflow-hidden bg-stone">
        {draft.images[0] && (
          <Image src={draft.images[0].url} alt="" fill sizes="320px" className="object-cover" />
        )}
        <span className="absolute left-2 top-2 bg-ground px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em]">
          {saleLabel}
        </span>
      </div>
      <div className="p-3">
        <p className="truncate text-[14px]">{draft.title || 'Untitled piece'}</p>
        <p className="text-[12px] text-muted-2">
          {shop.name} · {formatPrice(price)}
        </p>
        {timing && <p className="mt-1 text-[12px] text-muted">{timing}</p>}
      </div>
    </div>
  );

  const primaryLabel = mode === 'admin' ? 'Save to shop' : live ? 'Save changes' : 'Publish piece';
  const primary = (
    <button
      type="button"
      onClick={() =>
        void (mode === 'admin'
          ? save('draft').then(
              (ok) => ok && showToast('Saved to the shop. It goes live when the maker does.'),
            )
          : live
            ? save('draft').then((ok) => ok && showToast('Saved.'))
            : publish())
      }
      disabled={saving || (mode !== 'admin' && !check.ready)}
      className="glass-dark min-h-[48px] px-6 text-[11px] uppercase tracking-[0.18em] disabled:cursor-not-allowed disabled:opacity-50"
      data-testid="publish-piece"
    >
      {primaryLabel}
    </button>
  );

  return (
    <div data-testid="piece-editor">
      {!embedded && (
        <div className="sticky top-[60px] z-20 -mx-4 mb-2 flex items-center justify-between gap-3 border-b border-line bg-[rgb(var(--ground-rgb)/0.92)] px-4 py-3 backdrop-blur md:mx-0 md:px-0">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href={backHref}
              className="flex h-11 w-11 items-center justify-center"
              aria-label="Back to listings"
            >
              <ArrowLeftIcon width={18} height={18} />
            </Link>
            <p
              className="truncate text-[12px] text-muted"
              aria-live="polite"
              data-testid="save-state"
            >
              <span className="text-ink">
                {live
                  ? shopLive || mode === 'admin'
                    ? 'Live'
                    : 'Published · shows when your shop goes live'
                  : mode === 'admin'
                    ? 'Draft · set up by Off One'
                    : 'Draft'}
              </span>{' '}
              ·{' '}
              {saving ? 'saving…' : dirty && savedAt ? 'unsaved changes' : savedLabel(savedAt, now)}
            </p>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            {!live && (
              <button
                type="button"
                onClick={() => void save('draft').then((ok) => ok && showToast('Draft saved.'))}
                disabled={saving}
                className="min-h-[48px] border border-ink px-5 text-[11px] uppercase tracking-[0.18em]"
                data-testid="save-draft"
              >
                Save draft
              </button>
            )}
            {primary}
          </div>
        </div>
      )}

      {!embedded && (
        <div className="md:hidden">
          <p className="mt-2 text-[11px] uppercase tracking-label text-muted-2">
            Step {step + 1} of {STEPS.length} · {STEPS[step]}
          </p>
          <div className="mt-2 grid grid-cols-5 gap-1" aria-hidden>
            {STEPS.map((s, i) => (
              <span key={s} className={`h-[3px] ${i <= step ? 'bg-ink' : 'bg-line-strong'}`} />
            ))}
          </div>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mt-3 bg-error-bg px-3 py-2 text-[13px] text-alert"
          data-testid="editor-error"
        >
          {error}
        </p>
      )}

      <div className={embedded ? '' : 'md:grid md:grid-cols-[minmax(0,1fr)_320px] md:gap-10'}>
        <div>
          {photos}
          {basics}
          <StorySection
            story={draft.story}
            onChange={(story) => update({ story })}
            productId={id}
            makerId={shop.makerId}
            className={stepClass(STORY_STEP)}
            onSkip={embedded ? undefined : () => setStep(SIZES_STEP)}
          />
          {sold}
          {sizes}
          {priceSection}
          {shipping}
          {!embedded && (
            <section
              className={`py-6 md:hidden ${step === CHECK_STEP ? '' : 'hidden'}`}
              aria-label="Check it"
              data-testid="check-it"
            >
              <h2 className="text-[26px] leading-none">Check it</h2>
              <div className="mt-4">{preview}</div>
              <dl className="mt-4 divide-y divide-line border-y border-line text-[13px]">
                {[
                  ['Photos', `${draft.images.length} photos`, 0],
                  [
                    'Details',
                    [
                      draft.title || 'No name',
                      PIECE_CATEGORIES.find((c) => c.value === draft.category)?.label,
                      saleLabel,
                    ]
                      .filter(Boolean)
                      .join(' · '),
                    1,
                  ],
                  [
                    'Story',
                    storyAdded
                      ? `${storyPrompts(draft.story, 'phone')} of 4 prompts`
                      : 'Not added · optional',
                    STORY_STEP,
                  ],
                  [
                    'Sizes & price',
                    `${
                      draft.sizes
                        .filter((s) =>
                          draft.saleType === 'ready_to_ship' ? s.stock > 0 : s.offered,
                        )
                        .map((s) => s.size)
                        .join(', ') || 'No sizes'
                    } · ${formatPrice(price)}`,
                    SIZES_STEP,
                  ],
                ].map(([label, value, k]) => (
                  <div
                    key={label as string}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <dt className="text-muted-2">{label}</dt>
                    <dd className="min-w-0 flex-1 truncate text-right">{value}</dd>
                    <button
                      type="button"
                      className="min-h-[44px] pl-2 text-[12px] underline"
                      onClick={() => setStep(k as number)}
                    >
                      Edit<span className="sr-only"> {label}</span>
                    </button>
                  </div>
                ))}
              </dl>
              <div className="mt-4">{checklist}</div>
            </section>
          )}
        </div>
        {!embedded && (
          <aside className="hidden md:block">
            <div className="sticky top-[140px] space-y-4 pt-7">
              {preview}
              {checklist}
            </div>
          </aside>
        )}
      </div>

      {embedded ? (
        <div className="sticky bottom-0 mt-4 flex items-center justify-between gap-3 border-t border-line bg-ground py-3">
          <span className="text-[12px] text-muted">
            {check.passed}/{check.items.length} ready
          </span>
          <button
            type="button"
            onClick={() => void save('draft').then((ok) => ok && onSaved?.())}
            disabled={saving}
            className="glass-dark min-h-[48px] px-6 text-[11px] uppercase tracking-[0.18em]"
            data-testid="embedded-save"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      ) : (
        <div className="glass-light fixed inset-x-0 bottom-0 z-30 flex gap-2 px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] md:hidden">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="min-h-[52px] flex-1 border border-ink text-[11px] uppercase tracking-[0.18em]"
            >
              Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              disabled={step === 0 && draft.images.length < MIN_PHOTOS}
              className="glass-dark min-h-[52px] flex-[2] text-[11px] uppercase tracking-[0.18em] disabled:opacity-50"
              data-testid="step-next"
            >
              {step === 0 && draft.images.length < MIN_PHOTOS
                ? `Add ${MIN_PHOTOS - draft.images.length} more photo${MIN_PHOTOS - draft.images.length === 1 ? '' : 's'}`
                : step === STORY_STEP
                  ? hasStory(draft.story)
                    ? 'Next · sizes & price'
                    : 'Skip · sizes & price'
                  : 'Next'}
            </button>
          ) : (
            <div className="flex-[2] [&>button]:w-full">{primary}</div>
          )}
        </div>
      )}

      {measuresOpen && (
        <Sheet
          testId="measurements-sheet"
          variant="center"
          width={520}
          onClose={() => setMeasuresOpen(false)}
          title={<h2 className="font-display text-[28px] leading-tight">Garment measurements</h2>}
          footer={
            <button
              type="button"
              onClick={() => setMeasuresOpen(false)}
              className="glass-dark min-h-[48px] w-full text-[11px] uppercase tracking-[0.18em]"
            >
              Done
            </button>
          }
        >
          <p className="text-[13px] text-muted">
            Measured flat, in centimetres, on the sample size.
          </p>
          <table className="mt-4 w-full text-[13px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-label text-muted-2">
                <th scope="col" className="pb-2 font-normal">
                  Measurement
                </th>
                <th scope="col" className="pb-2 font-normal">
                  cm
                </th>
                <th scope="col" className="pb-2 font-normal">
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {draft.measurements.map((m, i) => (
                <tr key={i}>
                  <td className="py-1 pr-2">
                    <input
                      className="input"
                      aria-label={`Measurement ${i + 1} name`}
                      value={m.name}
                      placeholder="Bust (pit to pit)"
                      onChange={(e) =>
                        update({
                          measurements: draft.measurements.map((x, k) =>
                            k === i ? { ...x, name: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </td>
                  <td className="w-24 py-1 pr-2">
                    <input
                      className="input"
                      type="number"
                      inputMode="decimal"
                      aria-label={`Measurement ${i + 1} centimetres`}
                      value={Number.isFinite(m.valueCm) && m.valueCm ? m.valueCm : ''}
                      onChange={(e) =>
                        update({
                          measurements: draft.measurements.map((x, k) =>
                            k === i ? { ...x, valueCm: Number(e.target.value) } : x,
                          ),
                        })
                      }
                    />
                  </td>
                  <td className="w-11">
                    <button
                      type="button"
                      className="flex h-11 w-11 items-center justify-center"
                      aria-label={`Remove measurement ${i + 1}`}
                      onClick={() =>
                        update({ measurements: draft.measurements.filter((_, k) => k !== i) })
                      }
                    >
                      <CloseIcon width={14} height={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            type="button"
            className="mt-3 min-h-[44px] text-[13px] underline"
            onClick={() =>
              update({ measurements: [...draft.measurements, { name: '', valueCm: 0 }] })
            }
          >
            + Add a measurement
          </button>
        </Sheet>
      )}
    </div>
  );
}
