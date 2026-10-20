'use client';

import { Img as Image } from '@/components/ui/Img';
import { CUSTOM } from '@/lib/custom/config';
import { fmtDay, kindLabel, kindPlural, type Brief } from '@/lib/custom/brief';
import type { MatchResult } from '@/lib/services/custom';
import { Cap, Glass, Loop, Title } from './ui';

/** 8 · Finding: the loop draws while matching runs (at least CUSTOM.findingMs). */
export function Finding({
  brief,
  neededBy,
  checked,
  onSkip,
}: {
  brief: Brief;
  neededBy: string | null;
  checked: number | null;
  onSkip: () => void;
}) {
  const fabric = brief.fabrics.find((f) => f.toLowerCase() !== 'not sure');
  return (
    <div
      className="step-in flex min-h-[520px] flex-col items-center justify-center gap-[18px] text-center text-ink"
      role="status"
      aria-live="polite"
      data-testid="finding"
    >
      <Loop animate />
      <Title plain="Finding your" italic="makers…" />
      <div className="flex flex-col gap-1.5 text-[13px] text-muted">
        <span>Checking {checked ?? '…'} makers across Australia</span>
        <span>
          Who makes {kindPlural(brief.kind)}
          {fabric ? ` · in ${fabric.toLowerCase()}` : ''}
          {neededBy ? ` · by ${fmtDay(neededBy)}` : ''}
        </span>
        <span>
          Within your budget ·{' '}
          {brief.reach === 'near' || brief.fitMode === 'fitting'
            ? `near ${brief.suburb}`
            : `near ${brief.suburb} or posting`}
        </span>
      </div>
      <button
        type="button"
        onClick={onSkip}
        className="mt-2 text-[12px] text-muted-2 underline underline-offset-[3px]"
      >
        Skip the animation
      </button>
    </div>
  );
}

/** 9 · Matches: pick up to three. */
export function MatchList({
  result,
  picked,
  onPick,
  anonymous,
  onHelp,
  limitHit,
}: {
  result: MatchResult;
  picked: string[];
  onPick: (makerId: string) => void;
  anonymous: boolean;
  onHelp: () => void;
  limitHit: boolean;
}) {
  const n = result.eligibleCount + (result.matches.length > result.eligibleCount ? 1 : 0);
  return (
    <div className="step-in flex flex-col gap-4" data-testid="matches">
      <Cap>
        {n} maker{n === 1 ? '' : 's'} match{n === 1 ? 'es' : ''} your brief
      </Cap>
      <Title plain="Choose who" italic="to ask." />
      <p className="-mt-1.5 text-[13px] text-muted">
        Pick up to {CUSTOM.maxMakers}. They’ll see your brief{anonymous ? ' (anonymously)' : ''} and
        reply with a quote within {CUSTOM.replyHours} hours.
      </p>
      <div className="flex flex-col gap-2.5" role="group" aria-label="Makers">
        {result.matches.map((m) => {
          const on = picked.includes(m.makerId);
          return (
            <button
              key={m.makerId}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(m.makerId)}
              data-testid={`match-${m.slug}`}
              className={`flex border bg-surface text-left text-ink ${on ? 'border-ink shadow-[0_0_0_1px_#111111]' : 'border-line-strong'}`}
            >
              <span className="relative w-[96px] shrink-0 overflow-hidden bg-[#D2CBC1] md:w-[120px]">
                {m.imageUrl && (
                  <Image
                    src={m.imageUrl}
                    alt=""
                    fill
                    sizes="120px"
                    className="object-cover object-[center_20%]"
                  />
                )}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1.5 px-3.5 py-3">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-display text-[22px] leading-none">{m.name}</span>
                  <span
                    aria-hidden
                    className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-circle text-[11px] ${on ? 'bg-ink text-ground' : 'border border-line-strong text-transparent'}`}
                  >
                    ✓
                  </span>
                </span>
                <span className="text-[12px] text-muted">
                  {m.where}
                  {m.reviewCount > 0 ? ` · ★ ${m.rating.toFixed(1)}` : ' · New to Off One'}
                </span>
                <span className="flex flex-wrap gap-1">
                  {m.reasons.map((w) => (
                    <span key={w} className="bg-stone-light px-[7px] py-[3px] text-[11px]">
                      {w}
                    </span>
                  ))}
                </span>
                {m.warning && (
                  <span className="text-[11px] text-[#8A2E1C]" data-testid="near-miss">
                    {m.warning}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      <p
        className={`text-center text-[12px] ${limitHit ? 'text-[#8A2E1C]' : 'text-transparent'}`}
        aria-live="polite"
        data-testid="pick-limit"
      >
        You can ask up to {CUSTOM.maxMakers}
      </p>
      <button
        type="button"
        onClick={onHelp}
        className="self-center text-[12px] text-muted underline-offset-[3px] hover:underline"
        data-testid="ask-help-link"
      >
        Not quite right? Ask Off One to help find someone
      </button>
    </div>
  );
}

/** 9 · No matches: widen, or hand it to the team. */
export function NoMatches({
  result,
  brief,
  neededBy,
  onWiden,
  onHelp,
}: {
  result: MatchResult;
  brief: Brief;
  neededBy: string | null;
  onWiden: (brief: Brief) => void;
  onHelp: () => void;
}) {
  const fabric = brief.fabrics.find((f) => f.toLowerCase() !== 'not sure');
  const what = `${fabric ? `${fabric.toLowerCase()} ` : ''}${kindLabel(brief.kind).toLowerCase()}`;
  return (
    <div className="step-in flex flex-col gap-4" data-testid="no-matches">
      <Cap>No exact matches, yet</Cap>
      <Title plain="Let’s find" italic="your maker." />
      <p className="-mt-1.5 text-[13px] text-muted">
        No one can make a {what}
        {neededBy ? ` by ${fmtDay(neededBy)}` : ''} within your budget
        {brief.reach === 'near' || brief.fitMode === 'fitting' ? ` near ${brief.suburb}` : ''}.
        {result.widen.length ? ' Try one of these:' : ''}
      </p>
      {result.widen.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {result.widen.map((w) => (
            <button
              key={w.kind}
              type="button"
              onClick={() => onWiden(w.brief)}
              data-testid={`widen-${w.kind}`}
              className="flex items-center justify-between border border-line-strong bg-surface px-3.5 py-3 text-left text-ink"
            >
              <span className="flex flex-col">
                <span className="font-medium">{w.label}</span>
                <span className="text-[12px] text-muted-2">
                  {w.count} maker{w.count === 1 ? '' : 's'}
                </span>
              </span>
              <span aria-hidden>›</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-2.5 bg-ink p-[18px] text-ground">
        <span className="font-display text-[26px] leading-[1.05]">
          Or let us find someone for you.
        </span>
        <span className="text-[13px] text-line-strong">
          Our team knows every maker personally. We’ll reply within 1 business day.
        </span>
        <Glass
          onClick={onHelp}
          className="!min-h-[46px] !bg-ground !text-ink"
          data-testid="ask-help"
        >
          Ask Off One for help
        </Glass>
      </div>
    </div>
  );
}
