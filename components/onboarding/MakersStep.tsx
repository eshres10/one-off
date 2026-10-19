'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { stepDoneAction } from '@/lib/actions/onboarding';
import { toggleFollowAction } from '@/lib/actions/social';
import type { SuggestedMaker } from '@/lib/services/taste';
import { Img as Image } from '@/components/ui/Img';
import { ContinueButton, WelcomeShell } from './Shell';

/** Step 4: makers ranked from the shopper's taste and occasions. */
export function MakersStep({ makers }: { makers: SuggestedMaker[] }) {
  const router = useRouter();
  const [following, setFollowing] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(makers.map((m) => [m.id, m.following])),
  );
  const [pending, start] = useTransition();
  return (
    <WelcomeShell
      step={4}
      title="Your makers"
      intro="Studios that make what you picked. Follow them to hear about new pieces and pop-ups."
      footer={
        <ContinueButton
          pending={pending}
          onClick={() =>
            start(async () => {
              await stepDoneAction(4);
              router.push('/welcome?step=5');
            })
          }
        >
          Continue
        </ContinueButton>
      }
    >
      <ul className="divide-y divide-line border-y border-line" role="list">
        {makers.map((m) => {
          const on = following[m.id] ?? false;
          return (
            <li key={m.id} className="py-4" data-testid="suggested-maker">
              <div className="flex items-center gap-3">
                <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-circle bg-stone">
                  {m.avatarUrl && (
                    <Image src={m.avatarUrl} alt="" fill sizes="48px" className="object-cover" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-[24px] leading-none">
                    {m.displayName}
                  </span>
                  <span className="mt-1 block truncate text-[12px] text-muted">
                    {[m.suburb, m.makes].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setFollowing((f) => ({ ...f, [m.id]: !on }));
                    start(async () => {
                      const res = await toggleFollowAction(m.id);
                      if (res.following !== undefined)
                        setFollowing((f) => ({ ...f, [m.id]: res.following! }));
                    });
                  }}
                  className={`min-h-[40px] min-w-[104px] rounded-circle border px-4 text-[11px] uppercase tracking-label ${on ? 'border-ink bg-ink text-ground' : 'border-ink'}`}
                  data-testid="follow-maker"
                >
                  {on ? 'Following' : 'Follow'}
                </button>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                {m.pieces.slice(0, 3).map((p) => (
                  <span key={p.slug} className="relative aspect-4/5 overflow-hidden bg-stone">
                    {p.imageUrl && (
                      <Image
                        src={p.imageUrl}
                        alt=""
                        fill
                        sizes="150px"
                        className="object-cover object-top"
                      />
                    )}
                  </span>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </WelcomeShell>
  );
}
