import Link from 'next/link';
import { replayTourAction } from '@/lib/actions/tour';

export const metadata = { title: 'Help' };

export default function AccountHelpPage() {
  return (
    <div className="max-w-xl space-y-8">
      <section>
        <h1 className="text-[40px] leading-none">Help</h1>
        <p className="mt-3 text-[14px] text-muted">
          New here, or want a refresher? Take the 30-second tour of One Off again.
        </p>
        <form action={replayTourAction} className="mt-5">
          <input type="hidden" name="kind" value="customer" />
          <button
            className="glass-dark hidden min-h-[48px] px-6 text-[11px] uppercase tracking-[0.18em] text-ground md:inline-flex md:items-center"
            data-testid="replay-tour"
          >
            Replay the tour
          </button>
          <p className="text-[13px] text-muted md:hidden">
            The tour is made for bigger screens. On your phone,{' '}
            <Link href="/welcome?step=5" className="underline underline-offset-4">
              see how it works
            </Link>
            .
          </p>
        </form>
      </section>
      <section className="border-t border-line pt-6">
        <ul className="space-y-3 text-[14px]" role="list">
          <li>
            <Link href="/help/how-it-works" className="underline underline-offset-4">
              How One Off works
            </Link>
          </li>
          <li>
            <Link href="/returns" className="underline underline-offset-4">
              Returns and faults
            </Link>
          </li>
          <li>
            <Link href="/account/style" className="underline underline-offset-4">
              Your style
            </Link>
          </li>
        </ul>
      </section>
    </div>
  );
}
