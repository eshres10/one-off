import Link from 'next/link';
import { BRAND } from '@/lib/brand';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { sql } from '@/lib/db';
import { env } from '@/lib/env';
import { magicLinksEnabled } from '@/lib/features';
import { getEditorShop, getPriceHints } from '@/lib/queries/editor';
import {
  checkInvite,
  claimPieces,
  hasAgreement,
  myClaimShop,
  syncStripeAccount,
  type ClaimShop,
} from '@/lib/services/claim';
import { getPiece } from '@/lib/services/studio-listings';
import { sellerAgreementHtml } from '@/lib/studio/agreement';
import { dealTerms } from '@/lib/studio/deal';
import { TERMS } from '@/lib/studio/terms';
import { goToStepAction, stripeLinkAction } from '@/lib/actions/claim';
import { logoutAction } from '@/lib/actions/auth';
import { AgreeForm, GoLiveForm, ShippingForm, TakeALook } from '@/components/claim/ClaimForms';
import { ClaimPieces } from '@/components/claim/ClaimPieces';
import { CopyLink, ShareStory } from '@/components/claim/ShareStory';
import { AuthForms } from '@/components/forms/AuthForms';
import { ArrowLeftIcon, CheckIcon } from '@/components/ui/icons';
import { Img as Image } from '@/components/ui/Img';
import { Monogram } from '@/components/ui/Monogram';
import { Wordmark } from '@/components/ui/Wordmark';
import type { EditorPiece } from '@/lib/studio/pieces';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Claim your shop', robots: { index: false } };

const nn = (n: number | null) => String(n ?? 0).padStart(2, '0');

function Expired() {
  return (
    <main
      className="mx-auto flex min-h-screen max-w-[480px] flex-col justify-center px-6 py-16"
      data-testid="claim-expired"
    >
      <Wordmark size="mobile" />
      <h1 className="mt-10 text-[40px] leading-none">This link has expired.</h1>
      <p className="mt-4 text-[15px] text-muted">
        Message us on Instagram and we’ll send a new one.
      </p>
      <a href={`https://instagram.com/${BRAND.instagram}`} className="link mt-6 text-[14px]">
        @{BRAND.instagram}
      </a>
    </main>
  );
}

/** Welcome (step 0): full-bleed banner, white monogram, founding number, three thumbnails. */
async function Welcome({ shop, children }: { shop: ClaimShop; children: React.ReactNode }) {
  const pieces = await claimPieces(shop.id);
  return (
    <main className="mx-auto min-h-screen max-w-[480px] bg-ground" data-testid="claim-welcome">
      <section className="relative flex min-h-[460px] flex-col justify-between overflow-hidden bg-ink p-6 text-ground">
        {shop.coverUrl && (
          <Image
            src={shop.coverUrl}
            alt=""
            fill
            priority
            sizes="480px"
            className="object-cover opacity-70"
          />
        )}
        <span
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60"
        />
        <div className="relative flex items-center justify-between">
          <Wordmark size="mobile" />
          <Monogram className="h-12 w-12 text-ground" />
        </div>
        <div className="relative">
          {shop.foundingNumber && (
            <p className="text-[10px] uppercase tracking-[0.22em] text-ground/80">
              Founding maker · Nº {nn(shop.foundingNumber)} of {TERMS.foundingSpotsTotal}
            </p>
          )}
          <h1 className="mt-3 text-[44px] leading-[1]">Your shop is ready, {shop.displayName}.</h1>
        </div>
      </section>
      <div className="space-y-6 px-6 py-8">
        <p className="text-[15px] leading-relaxed">
          Ena from One Off listed {pieces.length} of your pieces and wrote your maker page.
        </p>
        <ul className="grid grid-cols-3 gap-2" role="list">
          {pieces.slice(0, 3).map((p) => (
            <li key={p.id} className="relative aspect-4/5 overflow-hidden bg-stone">
              {p.imageUrl && (
                <Image
                  src={p.imageUrl}
                  alt={p.title}
                  fill
                  sizes="150px"
                  className="object-cover object-top"
                />
              )}
            </li>
          ))}
        </ul>
        <ul className="space-y-3 text-[14px]" role="list">
          {[
            ...(shop.foundingNumber
              ? [
                  `${TERMS.foundingCommissionPct}% commission for your first ${TERMS.foundingMonths} months.`,
                ]
              : []),
            `Paid every ${TERMS.payoutWeekday[0]!.toUpperCase()}${TERMS.payoutWeekday.slice(1)}, straight to your bank.`,
            'You make it, we bring the buyers. Your photos stay yours.',
          ].map((b) => (
            <li key={b} className="flex gap-3">
              <CheckIcon width={16} height={16} className="mt-0.5 shrink-0" />
              {b}
            </li>
          ))}
        </ul>
        {children}
      </div>
    </main>
  );
}

const STEP_TITLES = [
  '',
  'Check what we listed',
  'The deal',
  'Connect your bank',
  'Shipping',
  'You’re live',
];

function Frame({ step, children }: { step: number; children: React.ReactNode }) {
  return (
    <main
      className="mx-auto min-h-screen max-w-[480px] px-5 pb-12 pt-4"
      data-testid={`claim-step-${step}`}
    >
      <div className="flex items-center gap-3">
        <Link
          href={`/claim/continue?step=${Math.max(0, step - 1)}`}
          aria-label="Back"
          className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center"
        >
          <ArrowLeftIcon width={18} height={18} />
        </Link>
        <div
          className="grid flex-1 grid-cols-4 gap-1"
          aria-label={`Step ${Math.min(step, 4)} of 4`}
          role="img"
        >
          {[1, 2, 3, 4].map((i) => (
            <span key={i} className={`h-[3px] ${i <= step ? 'bg-ink' : 'bg-line-strong'}`} />
          ))}
        </div>
      </div>
      <p className="mt-6 text-[11px] uppercase tracking-label text-muted-2">
        Step {Math.min(step, 4)} of 4
      </p>
      <h1 className="mt-2 text-[40px] leading-none">{STEP_TITLES[step]}</h1>
      <div className="mt-6">{children}</div>
    </main>
  );
}

export default async function ClaimPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { step?: string; return?: string; refresh?: string; live?: string };
}) {
  const user = await getSessionUser();

  // The invite link itself: check it, then sign in or claim.
  if (params.token !== 'continue') {
    const check = await checkInvite(params.token);
    if (!check.ok) return <Expired />;
    if (user && check.shop.userId === user.id) redirect('/claim/continue');
    if (check.used) return <Expired />;
    const { shop } = check;
    if (!user) {
      return (
        <Welcome shop={shop}>
          <div data-testid="claim-signin">
            <p className="mb-2 text-[14px]">Sign in or create your account to take it from here.</p>
            <AuthForms
              next={`/claim/${params.token}`}
              magicLinks={magicLinksEnabled()}
              defaultEmail={shop.inviteEmail ?? undefined}
              initialMode="signup"
              oauth={
                env().AUTH_DRIVER === 'supabase'
                  ? env()
                      .AUTH_OAUTH_PROVIDERS.split(',')
                      .map((p) => p.trim())
                      .filter(Boolean)
                  : []
              }
            />
          </div>
        </Welcome>
      );
    }
    if (user.makerId || user.role === 'admin') {
      return (
        <Welcome shop={shop}>
          <p className="bg-stone p-3 text-[13px]">
            You’re signed in as {user.email}, which{' '}
            {user.role === 'admin' ? 'is a One Off admin account' : 'already has a shop'}. Sign out
            and open this link again with {shop.inviteEmail ?? 'the invited email'}.
          </p>
          <form action={logoutAction}>
            <button className="min-h-[44px] text-[13px] underline">Sign out</button>
          </form>
        </Welcome>
      );
    }
    return (
      <Welcome shop={shop}>
        <TakeALook token={params.token} />
      </Welcome>
    );
  }

  // Signed-in owner, part way through.
  if (!user) redirect(`/login?next=${encodeURIComponent('/claim/continue')}`);
  let shop = await myClaimShop(user);
  if (!shop) {
    return (
      <main className="mx-auto max-w-[480px] px-6 py-16">
        <h1 className="text-[36px] leading-none">Open the link in your invite</h1>
        <p className="mt-4 text-[14px] text-muted">
          Your shop claim starts from the link in the email we sent. Can’t find it? Message us on
          Instagram.
        </p>
      </main>
    );
  }
  const live = shop.shopStatus === 'live' || shop.shopStatus === 'holiday';
  let step = Math.max(
    0,
    Math.min(5, Number(searchParams.step ?? (live ? 5 : Math.max(1, shop.claimStep)))),
  );
  if (!live && step > shop.claimStep + 1) step = shop.claimStep + 1;

  if (step === 0) {
    return (
      <Welcome shop={shop}>
        <form action={goToStepAction}>
          <input type="hidden" name="step" value="1" />
          <button
            className="glass-dark min-h-[52px] w-full text-[11px] uppercase tracking-[0.18em]"
            data-testid="take-a-look"
          >
            Take a look
          </button>
        </form>
      </Welcome>
    );
  }

  if (step === 1) {
    const [pieces, editorShop, hints] = await Promise.all([
      claimPieces(shop.id),
      getEditorShop(shop.id),
      getPriceHints(),
    ]);
    const records = await Promise.all(pieces.map((p) => getPiece(user, p.id)));
    const editable: Record<string, EditorPiece> = {};
    for (const r of records) if (r) editable[r.id] = { ...r, slug: r.slug, id: r.id };
    return (
      <Frame step={1}>
        <p className="mb-4 text-[14px] text-muted">
          Switch off anything you’d rather not sell, and fix any details. Nothing goes live until
          the end.
        </p>
        <ClaimPieces pieces={pieces} editable={editable} shop={editorShop!} priceHints={hints} />
      </Frame>
    );
  }

  if (step === 2) {
    const html = await sellerAgreementHtml();
    const lines = dealTerms(shop.foundingNumber);
    return (
      <Frame step={2}>
        <ul
          className="divide-y divide-line border-y border-line"
          role="list"
          data-testid="deal-terms"
        >
          {lines.map(([t, d]) => (
            <li key={t} className="py-3">
              <p className="text-[15px]">{t}</p>
              <p className="mt-0.5 text-[13px] text-muted">{d}</p>
            </li>
          ))}
        </ul>
        <div className="mt-6">
          <AgreeForm agreementHtml={html} />
        </div>
      </Frame>
    );
  }

  if (step === 3) {
    if (!(await hasAgreement(shop.id))) redirect('/claim/continue?step=2');
    if (searchParams.refresh) await stripeLinkAction();
    let pending = false;
    if (searchParams.return || shop.stripeAccountId) {
      const synced = await syncStripeAccount(user);
      shop = synced;
      pending = 'requirementsDue' in synced ? Boolean(synced.requirementsDue) : false;
    }
    return (
      <Frame step={3}>
        {shop.chargesEnabled || shop.bankLast4 ? (
          <div className="border border-ink p-4" data-testid="bank-connected">
            <p className="flex items-center gap-2 text-[15px]">
              <CheckIcon width={16} height={16} /> Connected{' '}
              {shop.bankName ? `${shop.bankName} ` : ''}
              {shop.bankLast4 ? `••${shop.bankLast4}` : ''}
            </p>
            <p className="mt-1 text-[12px] text-muted">
              Payouts go here every {TERMS.payoutWeekday[0]!.toUpperCase()}
              {TERMS.payoutWeekday.slice(1)}.
            </p>
          </div>
        ) : (
          <p className="text-[14px] text-muted">
            One Off pays you through Stripe. They’ll ask for your ABN (or that you’re a sole
            trader), your ID and your bank account. It takes about five minutes.
          </p>
        )}
        {(pending || (shop.stripeAccountId && !shop.chargesEnabled)) && (
          <p className="mt-4 bg-stone p-3 text-[13px]" data-testid="stripe-pending">
            Stripe verification can take up to a day. You can go live meanwhile.
          </p>
        )}
        <div className="mt-6 space-y-3">
          {!shop.chargesEnabled && (
            <form action={stripeLinkAction}>
              <button
                className="glass-dark min-h-[52px] w-full text-[11px] uppercase tracking-[0.18em]"
                data-testid="continue-to-stripe"
              >
                {shop.stripeAccountId ? 'Finish with Stripe' : 'Continue to Stripe'}
              </button>
            </form>
          )}
          {(shop.chargesEnabled || shop.stripeAccountId) && (
            <form action={goToStepAction}>
              <input type="hidden" name="step" value="4" />
              <button
                className={`${shop.chargesEnabled ? 'glass-dark' : 'border border-ink'} min-h-[52px] w-full text-[11px] uppercase tracking-[0.18em]`}
                data-testid="bank-next"
              >
                Continue
              </button>
            </form>
          )}
        </div>
      </Frame>
    );
  }

  if (step === 4) {
    const [rate] = await sql()<{ standardCents: number; expressCents: number | null }[]>`
      select standard_cents, express_cents from public.maker_shipping_rates where maker_id = ${shop.id} and region = 'au'`;
    return (
      <Frame step={4}>
        <ShippingForm
          standard={rate?.standardCents ?? 1200}
          express={rate?.expressCents ?? null}
          freeOver={shop.freeShippingOverCents !== null}
          dispatch={shop.dispatchOption ?? TERMS.readyToShipDispatchOptions[1]}
          mtoLead={shop.mtoDefaultLead ?? TERMS.mtoLeadOptions[1]}
          dispatchOptions={TERMS.readyToShipDispatchOptions}
          leadOptions={TERMS.mtoLeadOptions}
        />
      </Frame>
    );
  }

  // Step 5: go live, then the welcome.
  const shopUrl = `${env().APP_URL}/makers/${shop.slug}`;
  if (!live) {
    const kept = (await claimPieces(shop.id)).filter((p) => p.keepOnClaim).length;
    return (
      <Frame step={5}>
        <p className="text-[15px] leading-relaxed">
          {kept} {kept === 1 ? 'piece goes' : 'pieces go'} live with your shop
          {shop.foundingNumber
            ? `, and your ${TERMS.foundingMonths} months at ${TERMS.foundingCommissionPct}% commission start today.`
            : '.'}
        </p>
        {!shop.chargesEnabled && (
          <p className="mt-3 text-[13px] text-muted">
            Until Stripe finishes checking your details, buyers see “Coming soon” instead of a buy
            button.
          </p>
        )}
        <div className="mt-6">
          <GoLiveForm />
        </div>
      </Frame>
    );
  }
  return (
    <main
      className="mx-auto flex min-h-screen max-w-[480px] flex-col px-6 pb-12 pt-16 text-center"
      data-testid="claim-live"
    >
      <Monogram className="mx-auto h-20 w-20 text-ink" />
      <h1 className="mt-8 text-[48px] leading-none">Welcome to One Off.</h1>
      <p className="mt-4 text-[14px] text-muted">Your shop is live at</p>
      <a href={shopUrl} className="link mt-1 break-all text-[15px]" data-testid="shop-url">
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
    </main>
  );
}
