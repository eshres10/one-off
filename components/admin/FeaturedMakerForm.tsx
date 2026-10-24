'use client';

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { featureMakerAction } from '@/lib/actions/admin';
import { formatPrice } from '@/lib/domain/money';
import type { FeaturePiece } from '@/lib/services/home-feature';
import type { FormState } from '@/lib/validation';
import { SubmitButton } from '@/components/ui/SubmitButton';

const MAX = 10;

/** Pick 2–10 of the maker's pieces, order them, and feature them on the homepage hero. */
export function FeaturedMakerForm({
  makerId,
  pieces,
  initial,
  makerName,
}: {
  makerId: string;
  pieces: FeaturePiece[];
  initial: string[];
  makerName: string;
}) {
  const [state, action] = useFormState<FormState, FormData>(featureMakerAction, undefined);
  const byId = new Map(pieces.map((p) => [p.id, p]));
  const [ids, setIds] = useState(initial.filter((id) => byId.has(id)));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= ids.length) return;
    const next = [...ids];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it!);
    setIds(next);
  };
  const available = pieces.filter((p) => !ids.includes(p.id));
  const enough = ids.length >= 2;

  return (
    <form action={action} className="space-y-5" data-testid="feature-form">
      <input type="hidden" name="makerId" value={makerId} />
      {ids.map((id) => (
        <input key={id} type="hidden" name="productIds" value={id} />
      ))}

      <div>
        <p className="mb-2 text-sm font-medium">
          Pieces in rotation ({ids.length} of {MAX}, at least 2)
        </p>
        {ids.length === 0 ? (
          <p className="text-sm text-ink-muted">Add pieces from the list below.</p>
        ) : (
          <ol className="border-t border-line" data-testid="feature-order">
            {ids.map((id, i) => {
              const p = byId.get(id)!;
              return (
                <li
                  key={id}
                  className="grid grid-cols-[28px_48px_1fr_auto] items-center gap-3 border-b border-line bg-surface py-2 pr-2"
                >
                  <span className="text-center text-[12px] text-muted-2">{i + 1}</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.imageUrl} alt="" className="h-[60px] w-12 object-cover" />
                  <span className="text-[14px]">
                    {p.title} <span className="text-muted-2">· {formatPrice(p.priceCents)}</span>
                  </span>
                  <span className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => move(i, i - 1)}
                      disabled={i === 0}
                      aria-label={`Move ${p.title} up`}
                      className="min-h-[36px] min-w-[36px] border border-line text-[12px] disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => move(i, i + 1)}
                      disabled={i === ids.length - 1}
                      aria-label={`Move ${p.title} down`}
                      className="min-h-[36px] min-w-[36px] border border-line text-[12px] disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => setIds(ids.filter((x) => x !== id))}
                      aria-label={`Remove ${p.title}`}
                      className="min-h-[36px] border border-line px-3 text-[12px]"
                    >
                      Remove
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">
          {makerName}’s approved pieces with photos
        </legend>
        {pieces.length === 0 ? (
          <p className="text-sm text-ink-muted">
            None yet. A piece needs to be approved and have a real (not placeholder) photo.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {pieces.map((p) => {
              const on = ids.includes(p.id);
              return (
                <li key={p.id}>
                  <label className="flex min-h-[44px] cursor-pointer items-center gap-3 border border-line bg-surface p-2 text-[13px]">
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={!on && ids.length >= MAX}
                      onChange={(e) =>
                        setIds(e.target.checked ? [...ids, p.id] : ids.filter((x) => x !== p.id))
                      }
                    />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.imageUrl} alt="" className="h-10 w-8 object-cover" />
                    <span>{p.title}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {available.length === 0 && pieces.length > 0 && (
          <p className="mt-2 text-xs text-ink-muted">Every piece is in the rotation.</p>
        )}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-[12px] text-ink-muted">
          Starts (Melbourne time, blank means now)
          <input name="startsOn" type="date" className="input py-1.5 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-ink-muted">
          Ends on (blank means until you change it)
          <input name="endsOn" type="date" className="input py-1.5 text-sm" />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton disabled={!enough} data-testid="feature-submit">
          Feature on homepage
        </SubmitButton>
        {!enough && <span className="text-xs text-ink-muted">Choose at least 2 pieces.</span>}
        {state?.message && (
          <p
            role="status"
            className={`text-xs ${state.ok ? 'text-moss' : 'text-alert'}`}
            data-testid="feature-message"
          >
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
