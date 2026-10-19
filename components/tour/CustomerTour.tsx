'use client';

import Link from 'next/link';
import { completeTourAction } from '@/lib/actions/tour';
import { Tour, type TourStop } from './Tour';

const STOPS: TourStop[] = [
  {
    target: 'discover',
    title: 'Discover',
    body: 'Scroll an endless feed of pieces picked for you. Filter by size, colour and price.',
    tip: 'Tap the heart to save a piece. We’ll tell you if the price drops.',
  },
  {
    target: 'makers',
    title: 'Makers',
    body: 'Follow the ones you like to hear about new drops and pop-ups.',
  },
  {
    target: 'occasions',
    title: 'Occasions',
    body: 'Racing, weddings, black tie. Edits built around where you’re going.',
  },
  {
    target: 'search',
    title: 'Search',
    body: 'A piece, a maker, a colour, or just “wedding guest in March”.',
  },
  {
    target: 'account',
    title: 'Your account',
    body: 'Your saved pieces, the makers you follow, your orders and your messages.',
  },
  {
    target: 'bag',
    title: 'Your bag',
    body: 'Check out once, even with pieces from different studios. Each maker sends their piece straight to you.',
  },
];

/** The shopper's first desktop visit: a welcome window, six stops, and two things to try. */
export function CustomerTour({ firstName }: { firstName: string }) {
  return (
    <Tour
      testId="customer-tour"
      onComplete={() => completeTourAction('customer')}
      welcome={{
        title: `Welcome, ${firstName}`,
        subtitle: 'You’re in. Here’s how One Off works.',
        intro:
          'Every piece is made by an independent Australian maker, and you buy straight from them.',
        tiles: [
          { title: 'Made to order', body: 'Cut for you, in your size.' },
          { title: 'One of one', body: 'Only one exists. When it’s gone, it’s gone.' },
          { title: 'Ask the maker', body: 'Fit, fabric or a small change.' },
        ],
        dismissLabel: 'Explore on my own',
        startLabel: 'Show me around · 30 sec',
        image: '/seed/hero-velvet-sofa.jpg',
      }}
      stops={STOPS}
      final={({ replay, finish }) => (
        <>
          <h2 className="text-[36px] leading-none">Two things to try first</h2>
          <ul className="mt-5 grid gap-2 sm:grid-cols-2" role="list">
            <li className="bg-stone p-4">
              <p className="font-display text-[22px] leading-tight">Ask the maker</p>
              <p className="mt-1 text-[13px] text-muted">
                On any piece, ask about fit or a small change before you buy.
              </p>
            </li>
            <li className="bg-stone p-4">
              <p className="font-display text-[22px] leading-tight">Request a custom piece</p>
              <p className="mt-1 text-[13px] text-muted">
                Describe what you want and a maker will quote.{' '}
                <Link href="/custom" className="underline underline-offset-2" onClick={finish}>
                  Start a request
                </Link>
              </p>
            </li>
          </ul>
          <div className="mt-6 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={replay}
              className="min-h-[44px] text-[12px] underline underline-offset-4"
              data-testid="tour-replay"
            >
              Replay tour
            </button>
            <Link
              href="/discover"
              onClick={finish}
              className="glass-dark flex min-h-[48px] items-center px-6 text-[11px] uppercase tracking-[0.18em] text-ground"
              data-testid="tour-explore"
            >
              Start exploring
            </Link>
          </div>
        </>
      )}
    />
  );
}
