'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { keepPieceAction, piecesReviewedAction } from '@/lib/actions/claim';
import { formatPrice } from '@/lib/domain/money';
import type { EditorPiece, EditorShop } from '@/lib/studio/pieces';
import { PieceEditor } from '@/components/studio/editor/PieceEditor';
import { Sheet } from '@/components/studio/Sheet';
import { Switch } from '@/components/studio/Switch';
import { Img as Image } from '@/components/ui/Img';

interface Row {
  id: string;
  title: string;
  priceCents: number;
  imageUrl: string | null;
  keepOnClaim: boolean;
}

/** Step 1: every piece One Off listed, each with a show/hide switch and "Edit details". */
export function ClaimPieces({
  pieces,
  editable,
  shop,
  priceHints,
}: {
  pieces: Row[];
  editable: Record<string, EditorPiece>;
  shop: EditorShop;
  priceHints: Record<string, { low: number; high: number } | null>;
}) {
  const router = useRouter();
  const [keep, setKeep] = useState(() =>
    Object.fromEntries(pieces.map((p) => [p.id, p.keepOnClaim])),
  );
  const [editing, setEditing] = useState<string | null>(null);
  const [, start] = useTransition();
  const kept = Object.values(keep).filter(Boolean).length;
  return (
    <>
      <ul
        className="divide-y divide-line border-y border-line"
        role="list"
        data-testid="claim-pieces"
      >
        {pieces.map((p) => (
          <li
            key={p.id}
            className={`flex items-center gap-3 py-3 ${keep[p.id] ? '' : 'opacity-60'}`}
            data-testid="claim-piece"
          >
            <span className="relative aspect-4/5 w-16 shrink-0 overflow-hidden bg-stone">
              {p.imageUrl && (
                <Image
                  src={p.imageUrl}
                  alt=""
                  fill
                  sizes="64px"
                  className="object-cover object-top"
                />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px]">{p.title}</span>
              <span className="block text-[12px] text-muted-2">{formatPrice(p.priceCents)}</span>
              <button
                type="button"
                onClick={() => setEditing(p.id)}
                className="min-h-[36px] text-[12px] underline underline-offset-4"
                data-testid="edit-details"
              >
                Edit details
              </button>
            </span>
            <Switch
              checked={keep[p.id] ?? true}
              label={`Show ${p.title} in my shop`}
              testId="keep-switch"
              onChange={(v) => {
                setKeep((k) => ({ ...k, [p.id]: v }));
                start(async () => {
                  await keepPieceAction(p.id, v);
                });
              }}
            />
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[12px] text-muted">
        Hidden pieces stay in your Studio. You can show them any time.
      </p>
      <form action={piecesReviewedAction} className="mt-6">
        <LooksGoodButton count={kept} />
      </form>
      {editing && editable[editing] && (
        <Sheet
          testId="claim-edit-sheet"
          onClose={() => setEditing(null)}
          width={640}
          title={<h2 className="font-display text-[28px] leading-tight">Edit details</h2>}
        >
          <PieceEditor
            initial={editable[editing]!}
            shop={shop}
            priceHints={priceHints}
            embedded
            onSaved={() => {
              setEditing(null);
              router.refresh();
            }}
          />
        </Sheet>
      )}
    </>
  );
}

export function LooksGoodButton({ count }: { count: number }) {
  return (
    <button
      type="submit"
      className="glass-dark min-h-[52px] w-full text-[11px] uppercase tracking-[0.18em]"
      data-testid="looks-good"
    >
      Looks good · {count} {count === 1 ? 'piece' : 'pieces'}
    </button>
  );
}
