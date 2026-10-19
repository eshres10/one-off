'use client';

import { EmptyState } from '@/components/states/EmptyState';
import { HeartIcon as HeartLine } from '@/components/states/illustrations';
import { ThumbRow, type Thumb } from '@/components/states/ThumbRow';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { addSavedToBagAction, setSavedAction } from '@/lib/actions/social';
import { readLocalSaves, writeLocalSaves } from '@/lib/local-saves';
import { formatPrice } from '@/lib/domain/money';
import { topAlert } from '@/lib/domain/saved';
import type { FollowedMaker, SavedPiece } from '@/lib/queries/saved';
import { FollowButton } from '@/components/maker/FollowButton';
import { ButtonLink, buttonClass } from '@/components/ui/Button';
import { CloseIcon, HeartIcon } from '@/components/ui/icons';
import { Img as Image } from '@/components/ui/Img';
import { Toast } from '@/components/ui/Toast';

const ALERT_KEY = 'oneoff:saved-alert-dismissed';
const URGENT = 'text-[#8A2E1C]';

function SizePicker({ piece, onAdded }: { piece: SavedPiece; onAdded: () => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const sizes = piece.variants.filter((v) => v.inStock);
  const add = (variantId: string) =>
    start(async () => {
      const res = await addSavedToBagAction(piece.card.id, variantId);
      if (res.ok) onAdded();
      else setError(res.message ?? 'Couldn’t add this to your bag.');
    });
  return (
    <div className="mt-2">
      <p className="text-[11px] uppercase tracking-label text-muted-2">Choose a size</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {sizes.map((v) => (
          <button
            key={v.id}
            type="button"
            disabled={pending}
            onClick={() => add(v.id)}
            className="min-h-[44px] min-w-[44px] border border-line-strong px-2 text-[12px] hover:border-ink disabled:opacity-60"
          >
            {v.colour && piece.card.colours.length > 1 ? `${v.size} · ${v.colour}` : v.size}
          </button>
        ))}
      </div>
      {error && (
        <p className="mt-1.5 text-[12px] text-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function SavedCard({
  piece,
  checkoutOn,
  onRemove,
}: {
  piece: SavedPiece;
  checkoutOn: boolean;
  onRemove: () => void;
}) {
  const router = useRouter();
  const { card, status } = piece;
  const [inBag, setInBag] = useState(piece.inBag);
  const [picking, setPicking] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const sizes = piece.variants.filter((v) => v.inStock);
  const canBuy = checkoutOn && !card.previewOnly && sizes.length > 0;
  const added = () => {
    setInBag(true);
    setPicking(false);
    router.refresh();
  };

  return (
    <article className="relative" data-testid="saved-card">
      <Link href={`/products/${card.slug}`} className="block" tabIndex={-1} aria-hidden>
        <div className="relative aspect-4/5 overflow-hidden bg-stone-light">
          {card.imageUrl && (
            <Image
              src={card.imageUrl}
              alt=""
              fill
              sizes="(min-width: 768px) 25vw, 50vw"
              className="object-cover object-top"
            />
          )}
        </div>
      </Link>
      {card.previewOnly && (
        <span className="pointer-events-none absolute left-2 top-2 bg-ink px-2 py-[3px] text-[10px] uppercase leading-4 tracking-[0.14em] text-ground">
          Preview only
        </span>
      )}
      <button
        type="button"
        aria-label={`Remove ${card.title} from saved`}
        onClick={onRemove}
        className="absolute right-0 top-0 z-10 flex h-11 w-11 items-center justify-center"
        data-testid="saved-remove"
      >
        <HeartIcon filled width={16} height={16} />
      </button>
      <div className="px-2 pb-5 pt-2.5 md:px-3">
        <div className="flex items-baseline justify-between gap-3 text-[13px]">
          <h3 className="min-w-0 font-sans font-normal leading-snug">
            <Link href={`/products/${card.slug}`} className="line-clamp-1 hover:underline">
              {card.title}
            </Link>
          </h3>
          <p className="shrink-0">{formatPrice(card.priceCents)}</p>
        </div>
        <Link
          href={`/makers/${card.makerSlug}`}
          className="mt-0.5 inline-block text-[12px] text-muted-2 hover:underline"
        >
          {card.makerName}
        </Link>
        <p
          className={`mt-1.5 text-[12px] ${status.urgent ? URGENT : 'text-muted'}`}
          data-testid="saved-status"
        >
          {status.text}
        </p>
        <div className="mt-3">
          {inBag ? (
            <Link href="/bag" className={buttonClass('primary', 'sm', 'w-full')}>
              In your bag
            </Link>
          ) : (
            <button
              type="button"
              disabled={!canBuy || pending}
              aria-expanded={sizes.length > 1 ? picking : undefined}
              onClick={() => {
                if (sizes.length === 1)
                  start(async () => {
                    const res = await addSavedToBagAction(card.id, sizes[0]!.id);
                    if (res.ok) added();
                    else setError(res.message ?? null);
                  });
                else setPicking((p) => !p);
              }}
              className={buttonClass('secondary', 'sm', 'w-full disabled:opacity-50')}
            >
              {!checkoutOn || card.previewOnly
                ? 'Opens at launch'
                : sizes.length
                  ? pending
                    ? 'Adding…'
                    : 'Add to bag'
                  : 'Sold out'}
            </button>
          )}
          {picking && !inBag && <SizePicker piece={piece} onAdded={added} />}
          {error && (
            <p className="mt-1.5 text-[12px] text-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

export function SavedView({
  pieces: initialPieces,
  makers,
  signedIn,
  checkoutOn,
  startWith = [],
}: {
  pieces: SavedPiece[];
  makers: FollowedMaker[] | null;
  signedIn: boolean;
  checkoutOn: boolean;
  /** New arrivals shown when nothing is saved. */
  startWith?: Thumb[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'pieces' | 'makers'>('pieces');
  const [pieces, setPieces] = useState(initialPieces);
  const [undo, setUndo] = useState<{ piece: SavedPiece; index: number } | null>(null);
  const [dismissed, setDismissed] = useState<string | null>('');
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => setPieces(initialPieces), [initialPieces]);
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(ALERT_KEY));
    } catch {
      setDismissed(null);
    }
  }, []);

  const alert = topAlert(pieces);
  const alertKey = alert ? `${alert.card.id}:${alert.status.kind}` : null;
  const showAlert = alert && dismissed !== '' && dismissed !== alertKey;

  const persist = async (piece: SavedPiece, saved: boolean) => {
    if (signedIn) await setSavedAction(piece.card.id, saved, piece.priceAtSave);
    else {
      const list = readLocalSaves().filter((x) => x !== piece.card.id);
      writeLocalSaves(saved ? [piece.card.id, ...list] : list);
    }
  };

  const remove = (piece: SavedPiece) => {
    const index = pieces.findIndex((p) => p.card.id === piece.card.id);
    setPieces((list) => list.filter((p) => p.card.id !== piece.card.id));
    setUndo({ piece, index });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setUndo(null), 5000);
    void persist(piece, false);
  };

  const restore = () => {
    if (!undo) return;
    clearTimeout(timer.current);
    setPieces((list) => {
      const next = [...list];
      next.splice(Math.min(undo.index, next.length), 0, undo.piece);
      return next;
    });
    void persist(undo.piece, true).then(() => router.refresh());
    setUndo(null);
  };

  const tabClass = (on: boolean) =>
    `min-h-[48px] border-b-2 text-[11px] uppercase tracking-label ${on ? 'border-ink text-ink' : 'border-transparent text-muted-2'}`;

  return (
    <div>
      <div role="tablist" aria-label="Saved" className="flex gap-8 border-b border-line">
        <button
          type="button"
          role="tab"
          id="tab-pieces"
          aria-selected={tab === 'pieces'}
          aria-controls="panel-pieces"
          onClick={() => setTab('pieces')}
          className={tabClass(tab === 'pieces')}
        >
          Pieces ({pieces.length})
        </button>
        <button
          type="button"
          role="tab"
          id="tab-makers"
          aria-selected={tab === 'makers'}
          aria-controls="panel-makers"
          onClick={() => setTab('makers')}
          className={tabClass(tab === 'makers')}
        >
          Makers ({makers?.length ?? 0})
        </button>
      </div>

      {tab === 'pieces' ? (
        <div role="tabpanel" id="panel-pieces" aria-labelledby="tab-pieces" className="pt-4">
          {showAlert && alert && (
            <div
              className="mb-4 flex items-start justify-between gap-3 bg-stone-light px-4 py-3 text-[13px]"
              role="status"
              data-testid="saved-alert"
            >
              <p>
                <span className={URGENT}>{alert.status.text}</span>
                {' — '}
                <Link href={`/products/${alert.card.slug}`} className="link">
                  {alert.card.title}
                </Link>
              </p>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => {
                  setDismissed(alertKey);
                  try {
                    localStorage.setItem(ALERT_KEY, alertKey ?? '');
                  } catch {
                    // ignore
                  }
                }}
                className="-m-3 flex h-11 w-11 shrink-0 items-center justify-center"
              >
                <CloseIcon width={14} height={14} />
              </button>
            </div>
          )}
          {pieces.length ? (
            <ul
              className="-mx-[var(--gutter)] grid grid-cols-2 gap-[2px] md:mx-0 md:grid-cols-3 lg:grid-cols-4"
              role="list"
            >
              {pieces.map((p) => (
                <li key={p.card.id}>
                  <SavedCard piece={p} checkoutOn={checkoutOn} onRemove={() => remove(p)} />
                </li>
              ))}
            </ul>
          ) : (
            <div data-testid="saved-empty">
              <EmptyState
                icon={<HeartLine size={72} />}
                title="Nothing saved, yet."
                body="Tap the heart on any piece to keep it here. We’ll let you know if a saved one-of-one is about to go."
                actions={[{ label: 'Discover pieces', href: '/discover' }]}
              >
                <ThumbRow items={startWith} label="Start with these" />
              </EmptyState>
            </div>
          )}
        </div>
      ) : (
        <div role="tabpanel" id="panel-makers" aria-labelledby="tab-makers" className="pt-2">
          {!signedIn ? (
            <div className="py-16 text-center">
              <p className="font-display text-[32px] leading-tight">Follow makers you love</p>
              <p className="mt-2 text-[14px] text-muted">
                Sign in to follow makers and hear about their new pieces.
              </p>
              <div className="mt-6 flex justify-center">
                <ButtonLink href="/login?next=/saved" variant="secondary">
                  Sign in
                </ButtonLink>
              </div>
            </div>
          ) : makers && makers.length ? (
            <ul role="list" className="divide-y divide-line">
              {makers.map((m) => (
                <li key={m.id} className="flex items-center gap-4 py-4">
                  <Link
                    href={`/makers/${m.slug}`}
                    className="relative h-[52px] w-[52px] shrink-0 overflow-hidden rounded-circle bg-stone-light"
                    aria-hidden
                    tabIndex={-1}
                  >
                    {m.avatarUrl && (
                      <Image src={m.avatarUrl} alt="" fill sizes="52px" className="object-cover" />
                    )}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/makers/${m.slug}`}
                      className="font-display text-[24px] leading-tight hover:underline"
                    >
                      {m.displayName}
                    </Link>
                    <p className="truncate text-[12px] text-muted">
                      {[m.suburb, m.news].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <FollowButton makerId={m.id} following makerName={m.displayName} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="py-16 text-center">
              <p className="font-display text-[32px] leading-tight">No makers followed yet</p>
              <div className="mt-6 flex justify-center">
                <ButtonLink href="/makers" variant="secondary">
                  Find makers
                </ButtonLink>
              </div>
            </div>
          )}
        </div>
      )}

      {undo && (
        <Toast>
          <span>Removed from saved</span>
          <button
            type="button"
            onClick={restore}
            className="min-h-[44px] text-[11px] uppercase tracking-label underline underline-offset-[5px]"
          >
            Undo
          </button>
        </Toast>
      )}
    </div>
  );
}
