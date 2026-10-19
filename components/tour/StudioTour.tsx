'use client';

import Link from 'next/link';
import { completeTourAction } from '@/lib/actions/tour';
import { GUIDES } from '@/lib/studio/guide-list';
import { TERMS } from '@/lib/studio/terms';
import { Tour, type TourStop } from './Tour';

const weekday = TERMS.payoutWeekday[0]!.toUpperCase() + TERMS.payoutWeekday.slice(1);

const STOPS: TourStop[] = [
  {
    target: 'setup-checklist',
    title: 'Your setup checklist',
    body: 'Four quick jobs to get your shop ready. Tap a line to jump straight there.',
  },
  {
    target: 'add-piece',
    title: 'Add a piece',
    body: 'Three photos, a price and your sizes.',
    tip: 'Shoot in daylight against a plain wall: front, back and a close-up of the fabric.',
  },
  {
    target: 'needs-today',
    title: 'Needs you today',
    body: 'Every order to ship and message to answer, most urgent first.',
  },
  {
    target: 'nav-orders',
    title: 'Orders',
    body: 'You get an email and a text. Pack it, add the tracking number, tap Mark shipped.',
    tip: `Post ready-to-ship pieces within 2 business days (or your dispatch time), and made-to-order pieces by the date on the order.`,
  },
  {
    target: 'nav-messages',
    title: 'Messages',
    body: 'Reply within a day. Fast replies earn a badge and sell more.',
  },
  {
    target: 'nav-payouts',
    title: 'Payouts',
    body: `Every ${weekday}, ${TERMS.releaseDaysAfterDelivery} days after the buyer receives their piece.`,
  },
];

/** A maker's first desktop visit to Studio after claiming or setting up their shop. */
export function StudioTour() {
  return (
    <Tour
      testId="studio-tour"
      onComplete={() => completeTourAction('studio')}
      welcome={{
        title: 'Welcome to Studio',
        subtitle: 'Your shop is live. Let’s show you around.',
        intro: 'Everything you need to list, ship and get paid lives here.',
        tiles: [
          { title: 'List', body: 'Photos, a price and your sizes.' },
          { title: 'Ship', body: 'Pack it, track it, mark it shipped.' },
          { title: 'Get paid', body: `Every ${weekday}, straight to your bank.` },
        ],
        dismissLabel: 'I’ll explore myself',
        startLabel: 'Start the tour · 1 min',
        image: '/seed/banner-velvet-sofa.jpg',
      }}
      stops={STOPS}
      final={({ replay, finish }) => (
        <>
          <h2 className="text-[34px] leading-none">Handy guides, whenever you need them</h2>
          <ul className="mt-5 grid grid-cols-2 gap-2" role="list">
            {GUIDES.map((g) => (
              <li key={g.slug}>
                <Link
                  href={`/studio/help/${g.slug}`}
                  onClick={finish}
                  className="flex min-h-[80px] items-end bg-stone p-4 font-display text-[20px] leading-tight hover:bg-line"
                >
                  {g.title}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[12px] text-muted">
            Stuck? Message us from the ? button any time.
          </p>
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
              href="/studio/listings/new"
              onClick={finish}
              className="glass-dark flex min-h-[48px] items-center px-6 text-[11px] uppercase tracking-[0.18em] text-ground"
            >
              Add your first piece
            </Link>
          </div>
        </>
      )}
    />
  );
}
