'use client';

import { useRef, useState } from 'react';
import { reusableStoriesAction } from '@/lib/actions/studio-listings';
import { STORY_DETAILS } from '@/lib/listings/storyDetails';
import { STORY_LIMITS, type PieceStory } from '@/lib/listings/story';
import type { ReusableStory } from '@/lib/services/studio-listings';
import { CloseIcon, PlusIcon } from '@/components/ui/icons';
import { Img as Image } from '@/components/ui/Img';
import { Sheet } from '../Sheet';

/**
 * "Story of the garment" in the piece editor. Desktop: a section after the basics, with the quote.
 * Phones: step 3 of 5, "Every piece has a story", with no quote (it can be added on desktop).
 * Everything is optional and never blocks publishing.
 */
export function StorySection({
  story,
  onChange,
  productId,
  makerId,
  className = '',
  onSkip,
}: {
  story: PieceStory;
  onChange: (next: PieceStory) => void;
  productId: string | null;
  makerId: string;
  className?: string;
  /** Phones: "Skip for now · add it later". */
  onSkip?: () => void;
}) {
  const [copiedFrom, setCopiedFrom] = useState<string | null>(null);
  const [picker, setPicker] = useState<ReusableStory[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [custom, setCustom] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const set = (patch: Partial<PieceStory>) => {
    setCopiedFrom(null);
    onChange({ ...story, ...patch });
  };
  const toggle = (d: string) =>
    set({
      details: story.details.includes(d)
        ? story.details.filter((x) => x !== d)
        : story.details.length < STORY_LIMITS.details
          ? [...story.details, d]
          : story.details,
    });
  const own = story.details.filter((d) => !(STORY_DETAILS as readonly string[]).includes(d));

  async function openPicker() {
    setLoading(true);
    try {
      setPicker(await reusableStoriesAction({ makerId, exceptId: productId }));
    } finally {
      setLoading(false);
    }
  }

  async function addCloseup(file: File | undefined) {
    if (!file || story.closeups.length >= STORY_LIMITS.closeups) return;
    setUploading(true);
    setError(null);
    const body = new FormData();
    body.set('kind', 'stories');
    body.set('file', file);
    if (productId) body.set('productId', productId);
    try {
      const res = await fetch('/api/uploads', { method: 'POST', body });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error ?? 'Upload failed.');
      set({ closeups: [...story.closeups, { path: json.url, caption: '' }] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  const reuseLabel = copiedFrom ? `Copied from ${copiedFrom} ✓` : 'Reuse a story';

  return (
    <section
      aria-labelledby="story-title"
      className={`border-t border-line py-7 ${className}`}
      data-testid="story-section"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="story-title" className="text-[26px] leading-none">
          <span className="md:hidden">Every piece has a story</span>
          <span className="hidden md:inline">Story of the garment</span>
        </h2>
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted-2">Optional</span>
      </div>
      <p className="mt-3 text-[13px] text-muted">
        This is what makes your piece more than clothes. Answer any prompt you like and skip the
        rest. It shows as its own section on the product page.
      </p>

      <div className="mt-4 flex flex-col items-start gap-3 bg-stone px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px]">
          <span className="md:hidden">Reuse a story from another piece</span>
          <span className="hidden md:inline">
            Same piece in another colour? Reuse a story you’ve written.
          </span>
        </p>
        <button
          type="button"
          onClick={() => void openPicker()}
          disabled={loading}
          className="min-h-[40px] max-w-full shrink-0 truncate border border-ink px-4 text-[10px] uppercase tracking-[0.16em]"
          data-testid="story-reuse"
        >
          {loading ? 'Loading…' : reuseLabel}
        </button>
      </div>

      <div className="mt-5 space-y-5">
        <div className="hidden md:block">
          <label htmlFor="story-quote" className="label">
            A line in your words · shown big
          </label>
          <input
            id="story-quote"
            className="input"
            value={story.quote}
            maxLength={STORY_LIMITS.quote}
            placeholder="The one sentence you’d say if someone asked about it"
            onChange={(e) => set({ quote: e.target.value })}
            data-testid="story-quote"
          />
        </div>
        <div>
          <label htmlFor="story-inspiration" className="label">
            What inspired it?
          </label>
          <textarea
            id="story-inspiration"
            className="input min-h-[110px]"
            value={story.inspiration}
            maxLength={STORY_LIMITS.inspiration}
            placeholder="A place, a person, an old photo, a feeling. Where did this piece start?"
            onChange={(e) => set({ inspiration: e.target.value })}
            data-testid="story-inspiration"
          />
          {story.inspiration.length > STORY_LIMITS.inspiration - 200 && (
            <p className="mt-1 text-[12px] text-muted">
              {STORY_LIMITS.inspiration - story.inspiration.length} characters left
            </p>
          )}
        </div>
        <fieldset>
          <legend className="label">In the details · tap all that apply</legend>
          <div className="flex flex-wrap gap-2" data-testid="story-details">
            {[...STORY_DETAILS, ...own].map((d) => {
              const on = story.details.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(d)}
                  className={`min-h-[40px] rounded-circle border px-4 text-[12px] md:rounded-none md:px-3 ${on ? 'border-ink bg-ink text-ground' : 'border-line-strong hover:border-ink'}`}
                >
                  {d}
                </button>
              );
            })}
            {adding ? (
              <form
                className="flex items-center gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  const d = custom.trim().slice(0, STORY_LIMITS.detail);
                  if (d && !story.details.some((x) => x.toLowerCase() === d.toLowerCase()))
                    set({ details: [...story.details, d].slice(0, STORY_LIMITS.details) });
                  setCustom('');
                  setAdding(false);
                }}
              >
                <input
                  autoFocus
                  aria-label="Your own detail"
                  className="input min-h-[40px] w-44 py-1.5 text-[12px]"
                  value={custom}
                  maxLength={STORY_LIMITS.detail}
                  placeholder="e.g. Pin-tucked bodice"
                  onChange={(e) => setCustom(e.target.value)}
                  onBlur={() => !custom.trim() && setAdding(false)}
                  data-testid="story-detail-input"
                />
                <button type="submit" className="min-h-[40px] px-3 text-[12px] underline">
                  Add
                </button>
              </form>
            ) : (
              story.details.length < STORY_LIMITS.details && (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="min-h-[40px] rounded-circle border border-dashed border-line-strong px-4 text-[12px] text-muted md:rounded-none md:px-3"
                  data-testid="story-detail-add"
                >
                  + Add your own
                </button>
              )
            )}
          </div>
        </fieldset>
        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_180px]">
          <div>
            <label htmlFor="story-fabric" className="label">
              The fabric · where it’s from, why you chose it
            </label>
            <input
              id="story-fabric"
              className="input"
              value={story.fabric}
              maxLength={STORY_LIMITS.fabric}
              placeholder="e.g. deadstock linen from a Brunswick mill"
              onChange={(e) => set({ fabric: e.target.value })}
              data-testid="story-fabric"
            />
          </div>
          <div>
            <label htmlFor="story-hours" className="label">
              Time to make
            </label>
            <div className="relative">
              <input
                id="story-hours"
                type="number"
                inputMode="numeric"
                min={STORY_LIMITS.hoursMin}
                max={STORY_LIMITS.hoursMax}
                className="input pr-16"
                value={story.hoursToMake ?? ''}
                onChange={(e) => {
                  const n = Math.round(Number(e.target.value));
                  set({
                    hoursToMake:
                      e.target.value && n >= 1 ? Math.min(STORY_LIMITS.hoursMax, n) : null,
                  });
                }}
                data-testid="story-hours"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-muted">
                hours
              </span>
            </div>
          </div>
        </div>
        <fieldset>
          <legend className="label">Close-ups · up to 3 · inside seams, a hem, your sketch</legend>
          <ul className="grid grid-cols-3 gap-2" role="list" data-testid="story-closeups">
            {story.closeups.map((c, i) => (
              <li key={c.path}>
                <div className="relative aspect-square overflow-hidden bg-stone">
                  <Image
                    src={c.path}
                    alt={c.caption || `Close-up ${i + 1}`}
                    fill
                    sizes="240px"
                    className="object-cover"
                  />
                  <button
                    type="button"
                    className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center bg-ground/90"
                    aria-label={`Remove close-up ${i + 1}`}
                    onClick={() => set({ closeups: story.closeups.filter((_, k) => k !== i) })}
                  >
                    <CloseIcon width={12} height={12} />
                  </button>
                </div>
                <input
                  className="input mt-2 text-[13px]"
                  aria-label={`Close-up ${i + 1} caption`}
                  value={c.caption}
                  maxLength={STORY_LIMITS.caption}
                  placeholder="Caption"
                  onChange={(e) =>
                    set({
                      closeups: story.closeups.map((x, k) =>
                        k === i ? { ...x, caption: e.target.value } : x,
                      ),
                    })
                  }
                  data-testid={`story-caption-${i}`}
                />
              </li>
            ))}
            {Array.from({ length: STORY_LIMITS.closeups - story.closeups.length }, (_, i) => (
              <li key={`empty-${i}`}>
                <button
                  type="button"
                  disabled={uploading || i > 0}
                  onClick={() => fileInput.current?.click()}
                  className="flex aspect-square w-full flex-col items-center justify-center gap-1 border border-dashed border-line-strong bg-stone text-[12px] text-muted hover:border-ink disabled:hover:border-line-strong"
                  data-testid={i === 0 ? 'story-closeup-add' : undefined}
                  aria-label={
                    i === 0 ? 'Add close-up' : `Close-up slot ${story.closeups.length + i + 1}`
                  }
                >
                  {i === 0 && (
                    <>
                      <PlusIcon width={14} height={14} />
                      {uploading ? 'Uploading…' : 'Add close-up'}
                    </>
                  )}
                </button>
              </li>
            ))}
          </ul>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            aria-label="Choose a close-up"
            data-testid="story-closeup-input"
            onChange={(e) => {
              void addCloseup(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          {error && (
            <p role="alert" className="mt-2 text-[12px] text-alert">
              {error}
            </p>
          )}
        </fieldset>
        <p className="border-l-2 border-ink pl-3 text-[12px] text-muted">
          Be specific and true. “Hand-rolled hem” and “deadstock silk” mean something to buyers, and
          it’s what they’ll expect when it arrives.
        </p>
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="min-h-[44px] text-[13px] underline underline-offset-4 md:hidden"
            data-testid="story-skip"
          >
            Skip for now · add it later
          </button>
        )}
      </div>

      {picker && (
        <Sheet
          testId="story-reuse-sheet"
          variant="center"
          width={520}
          onClose={() => setPicker(null)}
          title={<h2 className="font-display text-[28px] leading-tight">Reuse a story</h2>}
        >
          {picker.length === 0 ? (
            <p className="text-[13px] text-muted">
              None of your other pieces has a story yet. Write one here and you can reuse it on the
              next.
            </p>
          ) : (
            <ul className="divide-y divide-line border-y border-line" role="list">
              {picker.map((r) => (
                <li key={r.productId}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 py-3 text-left"
                    onClick={() => {
                      // A copy: the close-ups keep pointing at the same files, but the two
                      // stories are separate rows from here on.
                      onChange({
                        ...r.story,
                        details: [...r.story.details],
                        closeups: r.story.closeups.map((c) => ({ ...c })),
                      });
                      setCopiedFrom(r.title);
                      setPicker(null);
                    }}
                    data-testid="story-reuse-option"
                  >
                    <span className="relative h-16 w-[52px] shrink-0 overflow-hidden bg-stone">
                      {r.cover && (
                        <Image src={r.cover} alt="" fill sizes="52px" className="object-cover" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[14px]">{r.title}</span>
                      <span className="block truncate text-[12px] text-muted">
                        {r.story.quote || r.story.inspiration || r.story.details.join(', ')}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Sheet>
      )}
    </section>
  );
}
