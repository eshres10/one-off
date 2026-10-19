'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { saveFitAction } from '@/lib/actions/onboarding';
import { HEIGHT_BANDS, ONBOARDING_SIZES } from '@/lib/taste/tags';
import { ContinueButton, WelcomeShell } from './Shell';

export function FitStep({ sizes, heightBand }: { sizes: string[]; heightBand: string | null }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>(sizes);
  const [height, setHeight] = useState<string | null>(heightBand);
  const [pending, start] = useTransition();
  const save = (s: string[], h: string | null) =>
    start(async () => {
      if (s.length) await saveFitAction({ sizes: s, heightBand: h });
    });
  return (
    <WelcomeShell
      step={1}
      title="Your fit"
      intro="Pick a couple if you’re between sizes."
      footer={
        <ContinueButton
          disabled={picked.length === 0}
          pending={pending}
          onClick={() =>
            start(async () => {
              await saveFitAction({ sizes: picked, heightBand: height });
              router.push('/welcome?step=2');
            })
          }
        >
          Continue
        </ContinueButton>
      }
    >
      <fieldset>
        <legend className="text-[11px] uppercase tracking-label text-muted-2">Size (AU)</legend>
        <div className="mt-3 grid grid-cols-4 gap-2" data-testid="size-tiles">
          {ONBOARDING_SIZES.map((s) => {
            const on = picked.includes(s);
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  const next = on ? picked.filter((x) => x !== s) : [...picked, s];
                  setPicked(next);
                  save(next, height);
                }}
                className={`min-h-[52px] border text-[15px] ${on ? 'border-ink bg-ink text-ground' : 'border-line-strong bg-surface'}`}
                data-testid={`fit-size-${s}`}
              >
                {s}
              </button>
            );
          })}
        </div>
      </fieldset>
      <fieldset className="mt-8">
        <legend className="text-[11px] uppercase tracking-label text-muted-2">Height</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {HEIGHT_BANDS.map((h) => {
            const on = height === h.value;
            return (
              <button
                key={h.value}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  const next = on ? null : h.value;
                  setHeight(next);
                  save(picked, next);
                }}
                className={`min-h-[44px] rounded-circle border px-4 text-[13px] ${on ? 'border-ink bg-ink text-ground' : 'border-line-strong'}`}
              >
                {h.label}
              </button>
            );
          })}
        </div>
      </fieldset>
      <p className="mt-8 bg-stone p-4 text-[13px] leading-relaxed">
        Made-to-order pieces can be cut to your exact measurements. You can add those later.
      </p>
    </WelcomeShell>
  );
}
