import { ButtonLink } from '@/components/ui/Button';

/** A sold one-of-one: the page stays up (links and search keep working), but it can't be bought. */
export function SoldPanel({
  title,
  makerName,
  similarHref,
}: {
  title: string;
  makerName: string;
  similarHref: string;
}) {
  return (
    <div data-testid="sold-panel">
      <p className="font-display text-[30px] leading-[1.05]">This one found its person.</p>
      <p className="mt-3 text-[14px] leading-relaxed text-muted">
        Only one {title} was ever made. {makerName} can make you something in the same spirit.
      </p>
      <div className="mt-6 flex flex-col gap-3">
        <ButtonLink href={similarHref} className="w-full" data-testid="ask-similar">
          Ask {makerName} for something similar
        </ButtonLink>
        <ButtonLink href="/discover?avail=ooo" variant="secondary" className="w-full">
          More one-of-ones
        </ButtonLink>
      </div>
    </div>
  );
}

/** The "Sold" stamp laid over a greyed-out photo. */
export function SoldStamp() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-[38%] z-[2] -translate-x-1/2 -rotate-12 border-2 border-ink bg-ground/80 px-6 py-2 font-display text-[44px] uppercase leading-none tracking-[0.12em] text-ink"
      data-testid="sold-stamp"
    >
      Sold
    </span>
  );
}
