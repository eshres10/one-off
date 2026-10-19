'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { saveOccasionsAction } from '@/lib/actions/onboarding';
import { OCCASIONS } from '@/lib/taste/tags';
import { CheckIcon } from '@/components/ui/icons';
import { Img as Image } from '@/components/ui/Img';
import { ContinueButton, WelcomeShell } from './Shell';

export function OccasionsStep({ occasions }: { occasions: string[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>(occasions);
  const [pending, start] = useTransition();
  return (
    <WelcomeShell
      step={2}
      title="Your occasions"
      intro="What are you dressing for? Pick as many as you like."
      footer={
        <ContinueButton
          disabled={picked.length === 0}
          pending={pending}
          onClick={() =>
            start(async () => {
              await saveOccasionsAction({ occasions: picked });
              router.push('/welcome?step=3');
            })
          }
        >
          Continue
        </ContinueButton>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        {OCCASIONS.map((o) => {
          const on = picked.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => {
                const next = on ? picked.filter((x) => x !== o.value) : [...picked, o.value];
                setPicked(next);
                if (next.length)
                  start(async () => void (await saveOccasionsAction({ occasions: next })));
              }}
              className="relative h-[150px] overflow-hidden text-left text-ground"
              data-testid={`occasion-${o.value}`}
            >
              <Image src={o.image} alt="" fill sizes="240px" className="object-cover object-top" />
              <span
                aria-hidden
                className="absolute inset-0 bg-gradient-to-t from-[rgba(17,17,17,0.7)] via-[rgba(17,17,17,0.15)] to-transparent"
              />
              {on && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 z-[1] shadow-[inset_0_0_0_3px_var(--ink)]"
                />
              )}
              <span
                aria-hidden
                className={`absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-circle border ${on ? 'border-ground bg-ground text-ink' : 'border-ground/80'}`}
              >
                {on && <CheckIcon width={13} height={13} />}
              </span>
              <span className="absolute bottom-3 left-3 font-display text-[26px] leading-none">
                {o.label}
              </span>
            </button>
          );
        })}
      </div>
    </WelcomeShell>
  );
}
