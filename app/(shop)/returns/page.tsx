import type { Metadata } from 'next';
import { getSessionUser } from '@/lib/auth/session';
import { RETURNS, RETURNS_IN_SHORT } from '@/lib/content/returns';
import { SITE } from '@/lib/site/config';
import { ProsePage, ProseSection } from '@/components/editorial/Prose';
import { ButtonLink } from '@/components/ui/Button';

export const metadata: Metadata = {
  title: 'Returns & faults',
  description: `${RETURNS_IN_SHORT[0]} ${RETURNS_IN_SHORT[1]} Report a faulty, damaged or not-as-described piece within ${RETURNS.reportWindowDays} days of delivery.`,
};

const PROBLEMS = [
  'faulty or damaged on arrival;',
  'wrong item, size or colour sent;',
  'noticeably different from the photos or description;',
  'a custom piece that doesn’t match the agreed measurements.',
];

const NOT_COVERED = [
  'a change of mind on a made-to-order, custom or one-of-one piece;',
  'the wrong standard size on a made-to-order or one-of-one piece (a ready-to-ship piece can be returned instead);',
  'normal wear after use;',
  'small variations that are part of handmade work and were shown in the listing.',
];

const RETURN_STEPS = [
  `On your order, choose ‘Return this piece’ within ${SITE.returns.readyToShipWindowDays} days of delivery.`,
  `Post it back to the maker with tracking within ${SITE.returns.sendWithinDays} days, ${SITE.returns.condition}.`,
  'The maker confirms it’s arrived, and you’re refunded the item price to how you paid. Original shipping isn’t refunded.',
];

const STEPS = [
  `Report it within ${RETURNS.reportWindowDays} days with photos.`,
  'The maker replies within 2 business days.',
  'Repair, replacement or refund — and if you can’t agree, One Off steps in.',
];

export default async function ReturnsPage() {
  const user = await getSessionUser();
  const ordersHref = user ? '/account/orders' : '/login?next=%2Faccount%2Forders';
  return (
    <ProsePage title="Returns & faults">
      <div className="bg-stone px-5 py-4" data-testid="returns-in-short">
        <p className="text-[11px] uppercase tracking-label">In short</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px] leading-relaxed">
          {RETURNS_IN_SHORT.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </div>

      <ProseSection id="returns" title={RETURNS.policyHeading}>
        <p>{RETURNS.policyBody}</p>
        <ol className="mt-4 space-y-3">
          {RETURN_STEPS.map((s, i) => (
            <li key={s} className="flex gap-4">
              <span className="font-display text-[24px] leading-none text-ink">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </ProseSection>

      <ProseSection id="faults" title={RETURNS.faultHeading}>
        <p>{RETURNS.faultBody}</p>
        <div className="mt-6">
          <ButtonLink href={ordersHref} data-testid="report-problem-link">
            Report a problem
          </ButtonLink>
        </div>
      </ProseSection>

      <ProseSection id="custom" title="Custom pieces">
        <p>
          Your measurements are saved with your order. If the finished piece doesn’t match them, the
          maker will alter it at no cost. If an alteration can’t fix it, they’ll remake it or refund
          you.
        </p>
      </ProseSection>

      <ProseSection id="covered" title="What counts as a problem">
        <ul className="list-disc pl-5">
          {PROBLEMS.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </ProseSection>

      <ProseSection id="not-covered" title="What isn’t covered">
        <ul className="list-disc pl-5">
          {NOT_COVERED.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </ProseSection>

      <ProseSection id="how-it-works" title="How it works">
        <ol className="space-y-3">
          {STEPS.map((s, i) => (
            <li key={s} className="flex gap-4">
              <span className="font-display text-[24px] leading-none text-ink">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </ProseSection>

      <p className="border-t border-line pt-6 text-[12px] text-muted-2">{RETURNS.aclNote}</p>
    </ProsePage>
  );
}
