'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { CheckIcon, PlusIcon } from '@/components/ui/icons';
import { Img as Image } from '@/components/ui/Img';

export interface PayoutExample {
  weekday: string;
  amount: string;
  lines: Array<[string, string]>;
  releaseDays: number;
}

function Card({
  n,
  title,
  visual,
  points,
}: {
  n: number;
  title: string;
  visual: React.ReactNode;
  points: string[];
}) {
  return (
    <>
      <div className="h-[250px] overflow-hidden">{visual}</div>
      <p className="mt-5 text-[11px] uppercase tracking-label text-muted-2">{n} of 4</p>
      <h2 className="mt-1 text-[32px] leading-none">{title}</h2>
      <ul className="mt-4 space-y-2.5 text-[14px]" role="list">
        {points.map((p) => (
          <li key={p} className="flex gap-3">
            <CheckIcon width={16} height={16} className="mt-0.5 shrink-0" />
            {p}
          </li>
        ))}
      </ul>
    </>
  );
}

/** Step 2 of /sell/start: four swipeable cards built from real Studio pieces of UI. */
export function SellingCards({ images, payout }: { images: string[]; payout: PayoutExample }) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const go = (i: number) => {
    setActive(i);
    const el = track.current;
    el?.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };
  const cards = [
    {
      title: 'You list a piece',
      visual: (
        <div className="flex h-full flex-col justify-center gap-3 bg-stone p-5">
          <div className="grid grid-cols-4 gap-1.5">
            {images.slice(0, 3).map((src, i) => (
              <span key={src} className="relative aspect-4/5 overflow-hidden bg-ground">
                <Image src={src} alt="" fill sizes="80px" className="object-cover object-top" />
                {i === 0 && (
                  <span className="absolute left-1 top-1 bg-ink px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-ground">
                    Cover
                  </span>
                )}
              </span>
            ))}
            <span className="flex aspect-4/5 items-center justify-center border border-dashed border-line-strong">
              <PlusIcon width={18} height={18} />
            </span>
          </div>
          <span className="glass-light w-fit px-3.5 py-2 text-[12px]">
            A$310 · Sizes 8–12 · Ready to ship
          </span>
        </div>
      ),
      points: [
        'Three or more photos, in daylight.',
        'Your price and sizes. You see your take-home as you type.',
        'Pick how it’s sold: ready to ship, made to order or one of one.',
      ],
    },
    {
      title: 'Someone buys it',
      visual: (
        <div className="flex h-full flex-col justify-center gap-2 bg-ink p-5 text-ground">
          {[
            ['You made a sale!', 'Silk slip · AU 10 · ship by Thursday'],
            ['Order #1047 · Paid in full', 'A$310 held safely until delivery'],
          ].map(([t, b]) => (
            <div key={t} className="border border-ground/20 bg-ground/10 px-4 py-3">
              <p className="text-[14px]">{t}</p>
              <p className="text-[12px] text-ground/70">{b}</p>
            </div>
          ))}
        </div>
      ),
      points: [
        'An email and a text the moment it sells.',
        'The buyer has already paid, and the money is held safely.',
        'Questions come to Messages, not your inbox.',
      ],
    },
    {
      title: 'You send it',
      visual: (
        <div className="flex h-full flex-col justify-center gap-3 bg-stone p-5" aria-hidden>
          <p className="text-[11px] uppercase tracking-label text-muted-2">Mark as shipped</p>
          <div className="flex gap-2">
            {['Australia Post', 'Sendle', 'Hand delivered'].map((c, i) => (
              <span
                key={c}
                className={`rounded-circle border px-3 py-1.5 text-[11px] ${i === 0 ? 'border-ink bg-ink text-ground' : 'border-line-strong bg-ground'}`}
              >
                {c}
              </span>
            ))}
          </div>
          <span className="border border-line-strong bg-ground px-3 py-2.5 text-[13px] text-muted">
            33LGV5038890501
          </span>
          <span className="glass-dark py-3 text-center text-[11px] uppercase tracking-[0.18em] text-ground">
            Mark shipped &amp; email buyer
          </span>
        </div>
      ),
      points: [
        'Pack it with care.',
        'Post within 2 business days, or by the made-to-order date.',
        'Add tracking and tap shipped. We email the buyer.',
      ],
    },
    {
      title: 'You get paid',
      visual: (
        <div className="flex h-full flex-col justify-center bg-ink p-5 text-ground">
          <p className="text-[10px] uppercase tracking-[0.2em] text-ground/70">
            Every {payout.weekday}
          </p>
          <p className="mt-1 font-display text-[44px] leading-none">{payout.amount}</p>
          <dl className="mt-4 space-y-1 text-[12px] text-ground/75">
            {payout.lines.map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      ),
      points: [
        `Paid weekly, ${payout.releaseDays} days after delivery.`,
        'You keep shipping in full.',
        'Faulty items are repaired, replaced or refunded. No change-of-mind returns.',
      ],
    },
  ];
  const last = active === cards.length - 1;
  return (
    <div>
      <div
        ref={track}
        tabIndex={0}
        className="no-scrollbar -mx-5 flex snap-x snap-mandatory overflow-x-auto"
        onScroll={(e) => {
          const el = e.currentTarget;
          const i = Math.round(el.scrollLeft / el.clientWidth);
          if (i !== active) setActive(i);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' && active < cards.length - 1) go(active + 1);
          if (e.key === 'ArrowLeft' && active > 0) go(active - 1);
        }}
        aria-roledescription="carousel"
        aria-label="How selling works"
      >
        {cards.map((c, i) => (
          <section
            key={c.title}
            className="w-full shrink-0 snap-start px-5"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${cards.length}`}
            data-testid="sell-card"
          >
            <Card n={i + 1} title={c.title} visual={c.visual} points={c.points} />
          </section>
        ))}
      </div>
      <div className="mt-6 flex justify-center" role="tablist" aria-label="Cards">
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
      <div className="mt-4">
        {last ? (
          <Link
            href="/sell/start?step=3"
            className="glass-dark flex min-h-[52px] w-full items-center justify-center text-[11px] uppercase tracking-[0.18em] text-ground"
            data-testid="sell-cards-continue"
          >
            Continue
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => go(active + 1)}
            className="glass-dark min-h-[52px] w-full text-[11px] uppercase tracking-[0.18em] text-ground"
            data-testid="sell-cards-next"
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
}
