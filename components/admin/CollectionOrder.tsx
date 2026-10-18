'use client';

import { useState, useTransition } from 'react';
import { collectionHeroAction, reorderCollectionsAction } from '@/lib/actions/admin';
import { ImageUploader } from '@/components/forms/ImageUploader';

interface Item {
  id: string;
  title: string;
  heroImageUrl: string | null;
}

/** Drag-to-reorder collections (keyboard: Move up / Move down), with hero image upload. */
export function CollectionOrder({ initial }: { initial: Item[] }) {
  const [items, setItems] = useState(initial);
  const [dragId, setDragId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const commit = (next: Item[]) => {
    setItems(next);
    setSaved(false);
    start(async () => {
      await reorderCollectionsAction(next.map((i) => i.id));
      setSaved(true);
    });
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it!);
    commit(next);
  };

  return (
    <div>
      <p className="mb-3 text-[12px] text-muted-2" aria-live="polite">
        Drag to reorder how collections appear on the site.{' '}
        {pending ? 'Saving…' : saved ? 'Order saved.' : ''}
      </p>
      <ol className="border-t border-line">
        {items.map((c, i) => (
          <li
            key={c.id}
            draggable
            onDragStart={() => setDragId(c.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              const from = items.findIndex((x) => x.id === dragId);
              if (from >= 0 && from !== i) move(from, i);
              setDragId(null);
            }}
            className={`grid cursor-grab grid-cols-[24px_64px_1fr_auto] items-center gap-4 border-b border-line bg-surface py-2 pr-2 ${dragId === c.id ? 'opacity-50' : ''}`}
          >
            <span aria-hidden className="text-center text-muted-2">
              ⋮⋮
            </span>
            <span
              className="block aspect-[5/4] w-16 bg-stone-light bg-cover bg-center"
              style={c.heroImageUrl ? { backgroundImage: `url(${c.heroImageUrl})` } : undefined}
            />
            <span className="text-[14px]">{c.title}</span>
            <span className="flex flex-wrap items-center justify-end gap-2">
              <ImageUploader
                name={`hero-${c.id}`}
                kind="collections"
                max={1}
                label="Hero image"
                onChange={(urls) => {
                  const url = urls[0];
                  if (!url) return;
                  setItems((all) =>
                    all.map((x) => (x.id === c.id ? { ...x, heroImageUrl: url } : x)),
                  );
                  start(() => collectionHeroAction(c.id, url));
                }}
              />
              <button
                type="button"
                onClick={() => move(i, i - 1)}
                disabled={i === 0}
                className="min-h-[44px] px-2 text-[10px] uppercase tracking-label disabled:text-disabled"
                aria-label={`Move ${c.title} up`}
              >
                Up
              </button>
              <button
                type="button"
                onClick={() => move(i, i + 1)}
                disabled={i === items.length - 1}
                className="min-h-[44px] px-2 text-[10px] uppercase tracking-label disabled:text-disabled"
                aria-label={`Move ${c.title} down`}
              >
                Down
              </button>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
