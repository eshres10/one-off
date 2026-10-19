import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { syncStripeAccount } from '@/lib/actions/seller';
import { sellStripeAction } from '@/lib/actions/sell';
import { formatPrice } from '@/lib/domain/money';
import { magicLinksEnabled } from '@/lib/features';
import { MAKES, SELL_MODES, mySellShop } from '@/lib/services/sell';
import { TERMS, processingEstimateCents } from '@/lib/studio/terms';
import { LabelForm } from '@/components/sell/LabelForm';
import { SellingCards } from '@/components/sell/SellingCards';
import { AuthForms } from '@/components/forms/AuthForms';
import { ArrowLeftIcon, CheckIcon } from '@/components/ui/icons';
import { Img as Image } from '@/components/ui/Img';
import { Monogram } from '@/components/ui/Monogram';
import { Wordmark } from '@/components/ui/Wordmark';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sell on One Off' };

const weekday = TERMS.payoutWeekday[0]!.toUpperCase() + TERMS.payoutWeekday.slice(1);
const TITLES = ['', 'Your label', 'How selling works', 'Connect your bank', ''];

/** The phone-first stepper frame shared with the claim flow: back arrow and a 3-part bar. */
function Frame({ step, children }: { step: number; children: React.ReactNode }) {
  return (
    <main
      className="mx-auto min-h-[100dvh] max-w-[480px] bg-ground px-5 pb-12 pt-4"
      data-testid={`sell-step-${step}`}
    >
      <div className="flex items-center gap-3">
        <Link
          href={`/sell/start?step=${Math.max(0, step - 1)}`}
          aria-label="Back"
          className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center"
        >
          <ArrowLeftIcon width={18} height={18} />
        </Link>
        {step <= 3 && (
          <div
            className="grid flex-1 grid-cols-3 gap-1"
            role="img"
            aria-label={`Step ${step} of 3`}
          >
            {[1, 2, 3].map((i) => (
              <span key={i} className={`h-[3px] ${i <= step ? 'bg-ink' : 'bg-line-strong'}`} />
            ))}
          </div>
        )}
      </div>
      {step <= 3 && (
        <>
          <p className="mt-6 text-[11px] uppercase tracking-label text-muted-2">{step}/3</p>
          <h1 className="mt-2 text-[40px] leading-none">{TITLES[step]}</h1>
        </>
      )}
      <div className="mt-6">{children}</div>
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

export default async function SellStartPage({
  searchParams,
}: {
  searchParams: { step?: string; return?: string };
}) {
  const step = Math.max(0, Math.min(4, Number(searchParams.step ?? 0) || 0));
  const user = await getSessionUser();

  if (step === 0) {
    return (
      <main
        className="mx-auto flex min-h-[100dvh] max-w-[480px] flex-col bg-ground"
        data-testid="sell-step-0"
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
          <div className="relative flex items-center gap-3">
            <Wordmark size="mobile" className="text-ground" />
            <span className="text-[10px] uppercase tracking-[0.24em] text-ground/80">Studio</span>
          </div>
          <div className="relative">
            <p className="text-[11px] uppercase tracking-[0.2em] text-ground/80">Sell on One Off</p>
            <h1 className="mt-2 text-[48px] leading-[0.95]">You make it. We’ll do the rest.</h1>
          </div>
        </section>
        <div className="flex flex-1 flex-col px-5 py-7">
          <ol className="space-y-4" role="list">
            {[
              ['Tell us about your label', 'Your name, where you work and what you make.'],
              ['Learn how selling works', 'Four quick cards. No jargon.'],
              ['Connect your bank', 'With Stripe, so you get paid every week.'],
            ].map(([t, b], i) => (
              <li key={t} className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-circle border border-ink font-display text-[16px]">
                  {i + 1}
                </span>
                <span>
                  <span className="block text-[15px]">{t}</span>
                  <span className="block text-[13px] text-muted">{b}</span>
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-auto pt-8">
            <Link
              href="/sell/start?step=1"
              className="glass-dark flex min-h-[52px] w-full items-center justify-center text-[11px] uppercase tracking-[0.18em] text-ground"
              data-testid="sell-get-started"
            >
              Get started
            </Link>
            <p className="mt-3 text-center text-[12px] text-muted">
              Free to join · {TERMS.foundingCommissionPct}% commission for founding makers
            </p>
          </div>
        </div>
      </main>
    );
  }

  // Everything after the welcome needs an account.
  if (!user) {
    return (
      <Frame step={1}>
        <p className="mb-6 text-[14px] text-muted">
          First, make an account. You’ll use it to sign in to Studio.
        </p>
        <AuthForms
          next="/sell/start?step=1"
          magicLinks={magicLinksEnabled()}
          initialMode="signup"
        />
      </Frame>
    );
  }
  if (user.role === 'admin') redirect('/admin/shops');

  const shop = await mySellShop(user);
  // A live shop has nothing left to set up here (but can still see its bank step and the end).
  if (shop && shop.shopStatus !== 'draft' && step < 3) redirect('/studio');
  if (!shop && step > 1) redirect('/sell/start?step=1');

  if (step === 1) {
    return (
      <Frame step={1}>
        <LabelForm
          makes={MAKES}
          modes={SELL_MODES}
          initial={{
            name: shop?.displayName ?? '',
            suburb: shop?.location ?? '',
            instagram: shop?.instagram ? `@${shop.instagram}` : '',
            makes: shop?.tags ?? [],
            modes: shop?.sellModes ?? [],
          }}
        />
      </Frame>
    );
  }

  if (step === 2) {
    return (
      <Frame step={2}>
        <SellingCards
          images={[
            '/seed/butter-silk-slip.jpg',
            '/seed/navy-satin-slip.jpg',
            '/seed/draped-satin-midi.jpg',
          ]}
          payout={payoutExample()}
        />
      </Frame>
    );
  }

  if (step === 3) {
    if (searchParams.return) await syncStripeAccount(shop!.id);
    const s = (await mySellShop(user))!;
    const connected = s.payoutsEnabled || s.chargesEnabled;
    return (
      <Frame step={3}>
        {connected ? (
          <>
            <div className="glass-dark p-6 text-ground" data-testid="sell-bank-connected">
              <CheckIcon width={22} height={22} />
              <p className="mt-3 font-display text-[30px] leading-none">Bank connected</p>
              <p className="mt-2 text-[13px] text-ground/75">
                {s.bankName ? `${s.bankName} ••${s.bankLast4 ?? ''} · ` : ''}Paid every {weekday}.
              </p>
            </div>
            <Link
              href="/sell/start?step=4"
              className="glass-dark mt-6 flex min-h-[52px] w-full items-center justify-center text-[11px] uppercase tracking-[0.18em] text-ground"
              data-testid="sell-bank-next"
            >
              Continue
            </Link>
          </>
        ) : (
          <>
            <p className="text-[14px] text-muted">
              We use Stripe to pay makers. It takes about five minutes.
            </p>
            <ol className="mt-6 space-y-4" role="list">
              {[
                'Tap Continue to Stripe',
                'Confirm it’s you',
                'Add your BSB and account',
                'You’re sent back here',
              ].map((t, i) => (
                <li key={t} className="flex items-center gap-4 text-[15px]">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-circle bg-stone font-display text-[16px]">
                    {i + 1}
                  </span>
                  {t}
                </li>
              ))}
            </ol>
            <form action={sellStripeAction} className="mt-8">
              <button
                className="glass-dark min-h-[52px] w-full text-[11px] uppercase tracking-[0.18em] text-ground"
                data-testid="sell-continue-stripe"
              >
                Continue to Stripe
              </button>
            </form>
            <Link
              href="/sell/start?step=4"
              className="mt-3 flex min-h-[44px] items-center justify-center text-[12px] underline underline-offset-4"
            >
              I’ll do this later
            </Link>
          </>
        )}
      </Frame>
    );
  }

  // Done.
  const s = (await mySellShop(user))!;
  const items: Array<[string, boolean, string]> = [
    ['Label details', true, '/sell/start?step=1'],
    ['Payouts connected', s.payoutsEnabled || s.chargesEnabled, '/sell/start?step=3'],
    ['Add your first piece', s.pieces > 0, '/studio/listings/new'],
    ['Set shipping prices', s.hasShipping, '/studio/settings#shipping'],
  ];
  return (
    <Frame step={4}>
      <Monogram className="mt-4 h-16 w-16 text-ink" />
      <h1 className="mt-6 text-[44px] leading-none">{s.displayName} is set up.</h1>
      <p className="mt-3 text-[14px] text-muted">
        Your shop goes live by itself once your first piece is published and your payouts are
        connected.
      </p>
      <ul
        className="mt-6 divide-y divide-line border-y border-line"
        role="list"
        data-testid="sell-checklist"
      >
        {items.map(([label, done, href]) => (
          <li key={label}>
            <Link href={href} className="flex min-h-[52px] items-center gap-3 text-[14px]">
              <span
                aria-hidden
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-circle border ${done ? 'border-ink bg-ink text-ground' : 'border-line-strong'}`}
              >
                {done && <CheckIcon width={13} height={13} />}
              </span>
              <span className={done ? 'text-muted-2 line-through' : ''}>{label}</span>
              <span className="sr-only">{done ? ' (done)' : ' (to do)'}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-6 bg-stone p-4 text-[13px] leading-relaxed">
        Rather we list your first pieces for you?{' '}
        <Link href="/studio/support?about=list-for-me" className="underline underline-offset-4">
          Send us your photos and prices
        </Link>
        .
      </p>
      <Link
        href="/studio/listings/new"
        className="glass-dark mt-8 flex min-h-[52px] w-full items-center justify-center text-[11px] uppercase tracking-[0.18em] text-ground"
        data-testid="sell-add-first-piece"
      >
        Add your first piece
      </Link>
    </Frame>
  );
}
