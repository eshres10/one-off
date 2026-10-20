import Link from 'next/link';
import { ButtonLink } from '@/components/ui/Button';

export const metadata = {
  title: 'Pop-ups & fittings',
  description: 'Meet Off One makers in person at Melbourne pop-ups and studio fittings.',
};

/** Pop-ups and fittings. No events are scheduled yet, so this says so plainly. */
export default function PopUpsPage() {
  return (
    <div className="container-page max-w-3xl pb-20 pt-10 md:pt-16">
      <p className="eyebrow">Pop-ups</p>
      <h1 className="mt-2 text-[48px] leading-none md:text-[72px]">Meet the makers</h1>
      <p className="mt-4 max-w-xl text-[15px] text-muted">
        We’re planning weekend pop-ups around Melbourne where you can try pieces on, meet the people
        who made them and book a fitting for made-to-order work. Dates will be announced here first.
      </p>

      <section
        id="fittings"
        aria-labelledby="fittings-title"
        className="mt-14 border-t border-line pt-8"
      >
        <h2 id="fittings-title" className="text-[32px] leading-none md:text-[40px]">
          Book a fitting
        </h2>
        <p className="mt-3 max-w-xl text-[14px] text-muted">
          Fittings will be bookable once the first pop-up dates are set. Until then, a maker can
          take your measurements over messages and make a piece to fit.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href="/custom">Request a custom piece</ButtonLink>
          <ButtonLink href="/how-it-works" variant="secondary">
            How made-to-order works
          </ButtonLink>
        </div>
      </section>

      <p className="mt-14 border-t border-line pt-8 text-[14px] text-muted">
        In the meantime,{' '}
        <Link href="/makers" className="link">
          meet the makers online
        </Link>{' '}
        or{' '}
        <Link href="/discover" className="link">
          discover their pieces
        </Link>
        .
      </p>
    </div>
  );
}
