import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireSeller } from '@/lib/auth/session';
import { sql } from '@/lib/db';
import { env } from '@/lib/env';
import { setupStripeAction } from '@/lib/actions/setup';
import { setupProgress } from '@/lib/queries/setup';
import { myClaimShop, syncStripeAccount } from '@/lib/services/claim';
import { goLiveIfReady } from '@/lib/services/sell';
import { sellerAgreementHtml } from '@/lib/studio/agreement';
import { dealTerms } from '@/lib/studio/deal';
import { TERMS } from '@/lib/studio/terms';
import { AgreeForm, ShippingForm } from '@/components/claim/ClaimForms';
import { CopyLink, ShareStory } from '@/components/claim/ShareStory';
import { CheckIcon } from '@/components/ui/icons';
import { Monogram } from '@/components/ui/Monogram';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Set up your shop' };

const weekday = TERMS.payoutWeekday[0]!.toUpperCase() + TERMS.payoutWeekday.slice(1);
const STEPS = ['Seller Agreement', 'Connect payouts', 'Shipping', 'Add your first piece'];
const cta =
  'glass-dark flex min-h-[52px] w-full items-center justify-center text-[11px] uppercase tracking-[0.18em] text-ground';

/**
 * After an application is approved: the agreement, payouts (the Stripe account is created now),
 * shipping and a first piece. The shop goes live by itself once payouts are connected and a piece
 * is published; then this page is the "You're live" screen.
 */
export default async function SetupPage({
  searchParams,
}: {
  searchParams: { step?: string; return?: string; refresh?: string; live?: string };
}) {
  const seller = await requireSeller();
  let shop = (await myClaimShop(seller))!;

  // Back from Stripe: read the account now rather than waiting for the webhook.
  if (searchParams.refresh) await setupStripeAction();
  if (shop.stripeAccountId && (searchParams.return || !shop.chargesEnabled)) {
    shop = await syncStripeAccount(seller);
    if (await goLiveIfReady(shop.id)) redirect('/studio/setup?live=1');
  }

  if (shop.shopStatus === 'live' || shop.shopStatus === 'holiday') {
    const shopUrl = `${env().APP_URL}/makers/${shop.slug}`;
    return (
      <div className="mx-auto max-w-[480px] py-6 text-center" data-testid="setup-live">
        <Monogram className="mx-auto h-20 w-20 text-ink" />
        <h1 className="mt-8 text-[48px] leading-none">You’re live.</h1>
        <p className="mt-4 text-[14px] text-muted">Your shop is open to buyers at</p>
        <a href={shopUrl} className="link mt-1 inline-block break-all text-[15px]">
          {shopUrl.replace(/^https?:\/\//, '')}
        </a>
        <div className="mt-10 border border-line bg-surface p-5 text-left">
          <p className="text-[11px] uppercase tracking-label text-muted-2">Tell your followers</p>
          <p className="mt-2 font-display text-[24px] leading-tight">
            A Story image of your shop, ready to post.
          </p>
          <div className="mt-4">
            <ShareStory href={`/api/story?shop=${shop.id}`} filename={`${shop.slug}-story.png`} />
          </div>
        </div>
        <div className="mt-3 space-y-3">
          <CopyLink url={shopUrl} />
          <Link
            href="/studio"
            className="flex min-h-[52px] items-center justify-center text-[11px] uppercase tracking-[0.18em] underline underline-offset-[6px]"
            data-testid="open-studio"
          >
            Open my Studio
          </Link>
        </div>
      </div>
    );
  }
  if (shop.shopStatus !== 'approved') redirect('/studio');

  const progress = await setupProgress(shop.id);
  const done = [progress.agreement, progress.payouts, progress.shipping, progress.piece];
  const firstOpen = done.findIndex((d) => !d) + 1 || 4;
  const step = Math.max(1, Math.min(4, Number(searchParams.step) || firstOpen));

  let body: React.ReactNode;
  if (step === 1) {
    body = (
      <>
        <ul
          className="divide-y divide-line border-y border-line"
          role="list"
          data-testid="deal-terms"
        >
          {dealTerms(shop.foundingNumber).map(([t, d]) => (
            <li key={t} className="py-3">
              <p className="text-[15px]">{t}</p>
              <p className="mt-0.5 text-[13px] text-muted">{d}</p>
            </li>
          ))}
        </ul>
        <div className="mt-6">
          {progress.agreement ? (
            <p className="flex items-center gap-2 text-[14px]" data-testid="agreement-signed">
              <CheckIcon width={16} height={16} /> You’ve signed the Seller Agreement.
            </p>
          ) : (
            <AgreeForm agreementHtml={await sellerAgreementHtml()} flow="setup" />
          )}
        </div>
      </>
    );
  } else if (step === 2) {
    body = (
      <>
        {shop.chargesEnabled ? (
          <div className="border border-ink p-4" data-testid="bank-connected">
            <p className="flex items-center gap-2 text-[15px]">
              <CheckIcon width={16} height={16} /> Connected{' '}
              {shop.bankName ? `${shop.bankName} ` : ''}
              {shop.bankLast4 ? `••${shop.bankLast4}` : ''}
            </p>
            <p className="mt-1 text-[12px] text-muted">Payouts go here every {weekday}.</p>
          </div>
        ) : (
          <>
            <p className="text-[14px] text-muted">
              One Off pays you through Stripe. They’ll ask for your ABN (or that you’re a sole
              trader), your ID and your bank account. It takes about five minutes.
            </p>
            {shop.stripeAccountId && (
              <p className="mt-4 bg-stone p-3 text-[13px]" data-testid="stripe-pending">
                Stripe is still checking your details. This can take up to a day; your shop goes
                live once it’s done.
              </p>
            )}
            <form action={setupStripeAction} className="mt-6">
              <button className={cta} data-testid="setup-stripe">
                {shop.stripeAccountId ? 'Finish with Stripe' : 'Continue to Stripe'}
              </button>
            </form>
          </>
        )}
      </>
    );
  } else if (step === 3) {
    const [rate] = await sql()<{ standardCents: number; expressCents: number | null }[]>`
      select standard_cents, express_cents from public.maker_shipping_rates where maker_id = ${shop.id} and region = 'au'`;
    body = (
      <ShippingForm
        flow="setup"
        standard={rate?.standardCents ?? 1200}
        express={rate?.expressCents ?? null}
        freeOver={shop.freeShippingOverCents !== null}
        dispatch={shop.dispatchOption ?? TERMS.readyToShipDispatchOptions[1]}
        mtoLead={shop.mtoDefaultLead ?? TERMS.mtoLeadOptions[1]}
        dispatchOptions={TERMS.readyToShipDispatchOptions}
        leadOptions={TERMS.mtoLeadOptions}
      />
    );
  } else {
    body = (
      <>
        <p className="text-[14px] text-muted">
          Three or more photos in daylight, your price and sizes. You see your take-home as you
          type.
          {progress.piece
            ? ' Your first piece is published.'
            : ' Your shop goes live once it’s published and payouts are connected.'}
        </p>
        <Link href="/studio/listings/new" className={`${cta} mt-6`} data-testid="setup-add-piece">
          {progress.piece ? 'Add another piece' : 'Add your first piece'}
        </Link>
        <p className="mt-4 bg-stone p-4 text-[13px] leading-relaxed">
          Rather we list your first pieces for you?{' '}
          <Link href="/studio/support?about=list-for-me" className="underline underline-offset-4">
            Send us your photos and prices
          </Link>
          .
        </p>
      </>
    );
  }

  return (
    <div className="mx-auto max-w-[560px]" data-testid="setup">
      <p className="text-[11px] uppercase tracking-label text-muted-2">
        {progress.done} of {progress.total} done
      </p>
      <h1 className="mt-2 text-[40px] leading-none md:text-[48px]">Set up your shop</h1>
      <p className="mt-3 text-[14px] text-muted">
        Studio is yours to use now. Buyers see your shop once payouts are connected and your first
        piece is published.
      </p>
      <ol className="mt-8 border-t border-line" role="list">
        {STEPS.map((title, i) => {
          const n = i + 1;
          const open = n === step;
          return (
            <li key={title} className="border-b border-line" data-testid={`setup-step-${n}`}>
              <Link
                href={`/studio/setup?step=${n}`}
                aria-current={open ? 'step' : undefined}
                className="flex min-h-[60px] items-center gap-4"
              >
                <span
                  aria-hidden
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-circle border font-display text-[16px] ${done[i] ? 'border-ink bg-ink text-ground' : open ? 'border-ink' : 'border-line-strong text-muted'}`}
                >
                  {done[i] ? <CheckIcon width={14} height={14} /> : n}
                </span>
                <span className={`text-[16px] ${open ? '' : 'text-muted'}`}>{title}</span>
                <span className="sr-only">{done[i] ? ' (done)' : ' (to do)'}</span>
              </Link>
              {open && <div className="pb-8 pl-12">{body}</div>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
