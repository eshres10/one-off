'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { stepDoneAction } from '@/lib/actions/onboarding';
import { HeartIcon } from '@/components/ui/icons';
import { Img as Image } from '@/components/ui/Img';
import { ContinueButton, WelcomeShell } from './Shell';

const MAKING = ['Order', 'Cut', 'Sew', 'Ship'];

function HeartVisual({ images }: { images: string[] }) {
  return (
    <div className="relative h-[250px] overflow-hidden bg-stone">
      {images.slice(0, 2).map((src, i) => (
        <span
          key={src}
          className={`absolute top-6 h-[170px] w-[136px] overflow-hidden bg-ground ${i === 0 ? 'left-[14%] -rotate-6' : 'right-[14%] rotate-6'}`}
        >
          <Image src={src} alt="" fill sizes="140px" className="object-cover object-top" />
          <span
            className={`absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-circle ${i === 1 ? 'bg-ink text-ground' : 'glass-chip'}`}
          >
            <HeartIcon width={14} height={14} filled={i === 1} />
          </span>
        </span>
      ))}
      <span className="glass-dark absolute inset-x-6 bottom-4 px-3 py-2.5 text-[12px] text-ground">
        Saved · we’ll tell you if it drops
      </span>
    </div>
  );
}

function MakingVisual() {
  return (
    <div className="flex h-[250px] flex-col justify-center bg-ink px-6 text-ground">
      <p className="text-[10px] uppercase tracking-[0.2em] text-ground/70">Your piece</p>
      <p className="mt-2 font-display text-[30px] leading-none">Day 6 of 14</p>
      <ol className="mt-6 grid grid-cols-4 gap-1" aria-label="Making progress">
        {MAKING.map((s, i) => (
          <li
            key={s}
            className={`border-t-2 pt-2 text-[10px] uppercase tracking-[0.14em] ${i <= 1 ? 'border-ground' : 'border-ground/30 text-ground/50'}`}
          >
            {s}
          </li>
        ))}
      </ol>
    </div>
  );
}

function AskVisual() {
  return (
    <div className="flex h-[250px] flex-col justify-center gap-3 bg-stone px-5">
      <p className="ml-auto max-w-[78%] bg-ink px-3.5 py-2.5 text-[13px] text-ground">
        Could you make it 5 cm longer? I’m 178 cm.
      </p>
      <p className="max-w-[78%] bg-surface px-3.5 py-2.5 text-[13px]">
        Of course! I’ll add 5 cm to the hem at no extra cost.
      </p>
      <p className="text-[11px] text-muted-2">Halde Studio · usually replies within 3 hours</p>
    </div>
  );
}

/** Step 5: three swipeable cards (scroll-snap) with dots and Next; buttons work without swiping. */
export function HowItWorks({ images }: { images: string[] }) {
  const router = useRouter();
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [pending, start] = useTransition();
  const cards = [
    {
      title: 'Heart what you love',
      body: 'Save pieces as you scroll and we’ll let you know if the price drops or it’s nearly gone.',
      visual: <HeartVisual images={images} />,
    },
    {
      title: 'Made to order is worth it',
      body: 'Pieces cut for you take a little longer, and you can follow every step from your order.',
      visual: <MakingVisual />,
    },
    {
      title: 'Just ask the maker',
      body: 'Message the person who makes it about fit, fabric or a small change before you buy.',
      visual: <AskVisual />,
    },
  ];
  const go = (i: number) => {
    const el = track.current;
    setActive(i);
    el?.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };
  const last = active === cards.length - 1;
  return (
    <WelcomeShell
      step={5}
      title="How it works"
      footer={
        <ContinueButton
          pending={pending}
          onClick={() =>
            last
              ? start(async () => {
                  await stepDoneAction(5);
                  router.push('/welcome?step=6');
                })
              : go(active + 1)
          }
          testId={last ? 'welcome-continue' : 'how-next'}
        >
          {last ? 'Finish' : 'Next'}
        </ContinueButton>
      }
    >
      <div
        ref={track}
        className="no-scrollbar -mx-4 flex snap-x snap-mandatory overflow-x-auto"
        onScroll={(e) => {
          const el = e.currentTarget;
          const i = Math.round(el.scrollLeft / el.clientWidth);
          if (i !== active) setActive(i);
        }}
        aria-roledescription="carousel"
        aria-label="How One Off works"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' && active < cards.length - 1) go(active + 1);
          if (e.key === 'ArrowLeft' && active > 0) go(active - 1);
        }}
      >
        {cards.map((c, i) => (
          <section
            key={c.title}
            className="w-full shrink-0 snap-start px-4"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${cards.length}`}
            data-testid="how-card"
          >
            {c.visual}
            <h2 className="mt-5 text-[30px] leading-none">{c.title}</h2>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">{c.body}</p>
          </section>
        ))}
      </div>
      <div className="mt-6 flex justify-center gap-1" role="tablist" aria-label="Cards">
        {cards.map((c, i) => (
          <button
            key={c.title}
            type="button"
            role="tab"
            aria-selected={i === active}
            aria-label={c.title}
            onClick={() => go(i)}
            className="flex h-11 w-11 items-center justify-center"
          >
            <span
              className={`block h-2 w-2 rounded-circle ${i === active ? 'bg-ink' : 'bg-line-strong'}`}
            />
          </button>
        ))}
      </div>
    </WelcomeShell>
  );
}
