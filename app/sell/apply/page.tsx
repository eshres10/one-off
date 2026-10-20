import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BRAND } from '@/lib/brand';
import { getSessionUser } from '@/lib/auth/session';
import { formatPrice } from '@/lib/domain/money';
import { magicLinksEnabled } from '@/lib/features';
import {
  DECLARATION,
  MADE_BY,
  applyState,
  missingAnswers,
  myApplication,
} from '@/lib/services/apply';
import { MAKES, SELL_MODES } from '@/lib/services/sell';
import { SITE } from '@/lib/site/config';
import { TERMS, processingEstimateCents } from '@/lib/studio/terms';
import { LabelForm, MessageUs, SubmitApplication, WorkForm } from '@/components/sell/ApplyForms';
import { ApplicationSummary } from '@/components/sell/ApplicationSummary';
import { SellingCards } from '@/components/sell/SellingCards';
import { AuthForms } from '@/components/forms/AuthForms';
import { ArrowLeftIcon } from '@/components/ui/icons';
import { Img as Image } from '@/components/ui/Img';
import { Monogram } from '@/components/ui/Monogram';
import { Wordmark } from '@/components/ui/Wordmark';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Apply to sell' };

const weekday = TERMS.payoutWeekday[0]!.toUpperCase() + TERMS.payoutWeekday.slice(1);
const TITLES = ['', 'Your label', 'Show us your work', 'How selling works'];
const date = (d: Date | string) =>
  new Date(d).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: SITE.adminTimeZone,
  });
const cta =
  'glass-dark flex min-h-[52px] w-full items-center justify-center text-[11px] uppercase tracking-[0.18em] text-ground';

/** The phone-first stepper frame shared with the claim flow: back arrow and a 3-part bar. */
function Frame({
  step,
  note,
  children,
}: {
  step: number;
  note?: string | null;
  children: React.ReactNode;
}) {
  return (
    <main
      className="mx-auto min-h-[100dvh] max-w-[480px] bg-ground px-5 pb-12 pt-4"
      data-testid={`apply-step-${step}`}
    >
      <div className="flex items-center gap-3">
        <Link
          href={`/sell/apply?step=${Math.max(0, step - 1)}`}
          aria-label="Back"
          className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center"
        >
          <ArrowLeftIcon width={18} height={18} />
        </Link>
        <div className="grid flex-1 grid-cols-3 gap-1" role="img" aria-label={`Step ${step} of 3`}>
          {[1, 2, 3].map((i) => (
            <span key={i} className={`h-[3px] ${i <= step ? 'bg-ink' : 'bg-line-strong'}`} />
          ))}
        </div>
      </div>
      {note && (
        <div className="mt-5 bg-stone p-4" data-testid="review-note">
          <p className="text-[11px] uppercase tracking-label text-muted-2">From Off One</p>
          <p className="mt-1 whitespace-pre-line text-[14px] leading-relaxed">{note}</p>
        </div>
      )}
      <p className="mt-6 text-[11px] uppercase tracking-label text-muted-2">{step}/3</p>
      <h1 className="mt-2 text-[40px] leading-none">{TITLES[step]}</h1>
      <div className="mt-6">{children}</div>
    </main>
  );
}

/** A single centred screen: under review, submitted, declined. */
function Panel({ testId, children }: { testId: string; children: React.ReactNode }) {
  return (
    <main
      className="mx-auto min-h-[100dvh] max-w-[480px] bg-ground px-6 pb-12 pt-10"
      data-testid={testId}
    >
      <Link href="/" aria-label={`${BRAND.name} home`}>
        <Wordmark size="mobile" />
      </Link>
      {children}
    </main>
  );
}

function payoutExample() {
  const piece = 31000;
  const shipping = 1200;
  const commission = Math.round((piece * TERMS.standardCommissionPct) / 100);
  const fee = processingEstimateCents(piece + shipping);
  return {
    weekday,
    amount: formatPrice(piece + shipping - commission - fee),
    releaseDays: TERMS.releaseDaysAfterDelivery,
    lines: [
      ['Piece', formatPrice(piece)],
      ['Shipping the buyer paid', formatPrice(shipping)],
      [`Commission (${TERMS.standardCommissionPct}%)`, `−${formatPrice(commission)}`],
      ['Card processing', `−${formatPrice(fee)}`],
    ] as Array<[string, string]>,
  };
}

function Welcome() {
  return (
    <main
      className="mx-auto flex min-h-[100dvh] max-w-[480px] flex-col bg-ground"
      data-testid="apply-step-0"
    >
      <section className="relative flex h-[52vh] min-h-[360px] flex-col justify-between overflow-hidden p-5 text-ground">
        <Image
          src="/seed/banner-velvet-sofa.jpg"
          alt=""
          fill
          priority
          sizes="480px"
          className="object-cover"
        />
        <span
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-[rgba(17,17,17,0.4)] via-transparent to-[rgba(17,17,17,0.65)]"
        />
        <Link href="/" aria-label={`${BRAND.name} home`} className="relative w-fit">
          <Wordmark size="mobile" className="text-ground" />
        </Link>
        <div className="relative">
          <p className="text-[11px] uppercase tracking-[0.2em] text-ground/80">Sell on Off One</p>
          <h1 className="mt-2 text-[48px] leading-[0.95]">You make it. We’ll do the rest.</h1>
        </div>
      </section>
      <div className="flex flex-1 flex-col px-5 py-7">
        <p className="text-[15px] leading-relaxed">
          We review every maker by hand, so everything on Off One is genuinely made by the people
          selling it.
        </p>
        <ol className="mt-6 space-y-4" role="list">
          {[
            'Tell us about your label',
            'Show us your work',
            `We review, usually within ${TERMS.reviewBusinessDays} business days`,
          ].map((t, i) => (
            <li key={t} className="flex items-center gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-circle border border-ink font-display text-[16px]">
                {i + 1}
              </span>
              <span className="text-[15px]">{t}</span>
            </li>
          ))}
        </ol>
        <div className="mt-auto pt-8">
          <Link href="/sell/apply?step=1" className={cta} data-testid="apply-start">
            Apply to sell
          </Link>
          <p className="mt-3 text-center text-[12px] text-muted">Free to apply.</p>
        </div>
      </div>
    </main>
  );
}

export default async function ApplyPage({ searchParams }: { searchParams: { step?: string } }) {
  const user = await getSessionUser();
  if (user?.role === 'admin') redirect('/admin/applications');
  const app = user ? await myApplication(user) : null;
  const state = applyState(app);

  if (state === 'done') {
    if (app!.shopStatus === 'invited') redirect('/claim/continue');
    redirect(app!.shopStatus === 'approved' ? '/studio/setup' : '/studio');
  }

  const requested = searchParams.step === undefined ? null : Number(searchParams.step) || 0;

  // Sent: the thank-you once, then "under review" with the answers read-only.
  if (state === 'applied') {
    if (requested === 4) {
      return (
        <Panel testId="apply-submitted">
          <Monogram className="mt-12 h-16 w-16 text-ink" />
          <h1 className="mt-6 text-[40px] leading-[1.02]">
            Thanks, {app!.answers.name}. Your application is in.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-muted">
            We review every application by hand, usually within {TERMS.reviewBusinessDays} business
            days. We’ll email you either way.
          </p>
          <p className="mt-8 text-[11px] uppercase tracking-label text-muted-2">
            What happens next
          </p>
          <ol className="mt-3 divide-y divide-line border-y border-line" role="list">
            {[
              'We review your application, and you get an email.',
              'If you’re approved, you connect your bank and list your first pieces.',
              'You go live.',
            ].map((t, i) => (
              <li key={t} className="flex items-center gap-4 py-3 text-[14px]">
                <span className="font-display text-[20px]">{i + 1}</span>
                {t}
              </li>
            ))}
          </ol>
          <div className="mt-8 space-y-3">
            <a
              href={`https://instagram.com/${BRAND.instagram}`}
              target="_blank"
              rel="noopener noreferrer"
              className={cta}
            >
              Follow @{BRAND.instagram} while you wait
            </a>
            <Link
              href="/"
              className="flex min-h-[44px] items-center justify-center text-[12px] underline underline-offset-4"
            >
              Back to Off One
            </Link>
          </div>
        </Panel>
      );
    }
    return (
      <Panel testId="apply-under-review">
        <p
          className="mt-10 text-[11px] uppercase tracking-label text-muted-2"
          data-testid="apply-status"
        >
          Under review · submitted {date(app!.appliedAt ?? new Date())}
        </p>
        <h1 className="mt-2 text-[40px] leading-none">{app!.answers.name}</h1>
        <p className="mt-3 text-[14px] leading-relaxed text-muted">
          We review every application by hand, usually within {TERMS.reviewBusinessDays} business
          days. We’ll email you either way.
        </p>
        <div className="mt-6">
          <ApplicationSummary answers={app!.answers} />
        </div>
        <div className="mt-6">
          <MessageUs />
        </div>
      </Panel>
    );
  }

  if (state === 'declined') {
    return (
      <Panel testId="apply-declined">
        <h1 className="mt-12 text-[40px] leading-[1.02]">Thank you for applying.</h1>
        <p className="mt-4 text-[15px] leading-relaxed">
          We’re not able to offer {app!.answers.name || 'you'} a shop on Off One right now. We know
          that’s disappointing, and we’re grateful you showed us your work.
        </p>
        {app!.reviewNote && (
          <p className="mt-5 whitespace-pre-line bg-stone p-4 text-[14px] leading-relaxed">
            {app!.reviewNote}
          </p>
        )}
        <p className="mt-5 text-[14px] text-muted" data-testid="reapply-after">
          You can apply again after {date(app!.canReapplyAfter!)}.
        </p>
        <Link
          href="/"
          className="mt-8 flex min-h-[44px] items-center text-[13px] underline underline-offset-4"
        >
          Back to Off One
        </Link>
      </Panel>
    );
  }

  // Writing (or reworking) the application.
  const editing = state === 'draft' || state === 'changes_requested';
  const step = Math.max(0, Math.min(3, requested ?? (editing ? 1 : 0)));
  if (step === 0) return <Welcome />;

  if (!user) {
    return (
      <Frame step={1}>
        <p className="mb-6 text-[14px] text-muted">
          First, make an account. We’ll save your application as you go, and you’ll use it to sign
          in to Studio if you’re approved.
        </p>
        <AuthForms
          next="/sell/apply?step=1"
          magicLinks={magicLinksEnabled()}
          initialMode="signup"
          sellerNote={false}
        />
      </Frame>
    );
  }

  const note = state === 'changes_requested' ? app!.reviewNote : null;
  const a = app?.answers;
  if (step > 1 && !app) redirect('/sell/apply?step=1');

  if (step === 1) {
    return (
      <Frame step={1} note={note}>
        <LabelForm
          makes={MAKES}
          modes={SELL_MODES}
          states={SITE.makerRegions}
          initial={{
            name: a?.name ?? '',
            ownerName: a?.ownerName || user.displayName || '',
            email: a?.email || user.email,
            mobile: a?.mobile ?? '',
            suburb: a?.suburb ?? '',
            state: a?.state ?? '',
            instagram: a?.instagram ? `@${a.instagram}` : '',
            website: a?.website ?? '',
            makes: a?.makes ?? [],
            modes: a?.modes ?? [],
          }}
        />
      </Frame>
    );
  }

  if (step === 2) {
    return (
      <Frame step={2} note={note}>
        <WorkForm
          madeBy={MADE_BY}
          declaration={DECLARATION}
          photos={TERMS.applicationPhotos}
          initial={{
            photos: a!.photos,
            madeBy: a!.madeBy,
            madeByDetail: a!.madeByDetail,
            process: a!.process,
            fabrics: a!.fabrics,
            declaration: a!.declaration,
          }}
        />
      </Frame>
    );
  }

  // Step 3: what to expect, then send.
  const missing = missingAnswers(a!);
  if (missing.includes('label')) redirect('/sell/apply?step=1');
  if (missing.includes('work')) redirect('/sell/apply?step=2');
  return (
    <Frame step={3} note={note}>
      <p className="-mt-2 mb-5 text-[14px] text-muted">What to expect if you’re approved.</p>
      <SellingCards
        images={[
          '/seed/butter-silk-slip.jpg',
          '/seed/navy-satin-slip.jpg',
          '/seed/draped-satin-midi.jpg',
        ]}
        payout={payoutExample()}
        finish={<SubmitApplication resubmit={state === 'changes_requested'} />}
      />
    </Frame>
  );
}
