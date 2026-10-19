import { makerCard } from '@/lib/og/data';
import { HolidayBanner } from '@/components/states/HolidayBanner';
import { holidayMessage, shipsFrom } from '@/lib/domain/shop';
import { SITE } from '@/lib/site/config';
import { openMakerThreadAction } from '@/lib/actions/messages';
import { DEFAULT_MAKER_BANNER } from '@/lib/editorial';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { Img as Image } from '@/components/ui/Img';
import { getSessionUser } from '@/lib/auth/session';
import {
  getMaker,
  getReviews,
  getSavedProductIds,
  isFollowing,
  makerSlugRedirect,
} from '@/lib/queries/catalog';
import { FollowButton } from '@/components/maker/FollowButton';
import { ProductGrid } from '@/components/product/ProductCard';
import { Reviews } from '@/components/product/Reviews';
import { EmptyState } from '@/components/ui/EmptyState';
import { BoxButtonGroup, boxButtonClass } from '@/components/ui/Button';
import { CheckIcon } from '@/components/ui/icons';

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const data = await getMaker(params.slug);
  if (!data) return { title: 'Maker' };
  const share = await makerCard(params.slug);
  const title = `${data.maker.displayName} — One Off`;
  const description =
    data.maker.tagline ??
    `Original pieces by ${data.maker.displayName}, made in ${data.maker.city ?? 'Australia'}.`;
  const image = {
    url: `/og/makers/${data.maker.slug}?v=${share?.version ?? '0'}`,
    width: 1200,
    height: 630,
    alt: data.maker.displayName,
  };
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `/makers/${data.maker.slug}` },
    openGraph: {
      type: 'website',
      title,
      description,
      url: `/makers/${data.maker.slug}`,
      images: [image],
    },
    twitter: { card: 'summary_large_image', title, description, images: [image.url] },
  };
}

const TABS = [
  { id: 'made_to_order', label: 'Made to order' },
  { id: 'ready_to_ship', label: 'Ready to ship' },
  { id: 'one_of_one', label: 'One of one' },
] as const;

export default async function MakerPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { type?: string; preview?: string };
}) {
  const user = await getSessionUser();
  let data = await getMaker(params.slug);
  let preview = false;
  // "Preview, not live": One Off (and the shop's owner) can see a shop before it launches.
  if (!data && searchParams.preview === '1' && user) {
    const draft = await getMaker(params.slug, { preview: true });
    if (draft && (user.role === 'admin' || draft.maker.userId === user.id)) {
      data = draft;
      preview = true;
    }
  }
  if (!data) {
    const moved = await makerSlugRedirect(params.slug);
    if (moved) permanentRedirect(`/makers/${moved}`);
    notFound();
  }
  const { maker, products } = data;
  const [following, saved, reviews] = await Promise.all([
    isFollowing(user?.id ?? null, maker.id),
    getSavedProductIds(user?.id ?? null),
    getReviews({ makerId: maker.id }, 6),
  ]);
  const type = TABS.find((t) => t.id === searchParams.type)?.id;
  const shown = type ? products.filter((p) => p.productType === type) : products;
  const counts = Object.fromEntries(
    TABS.map((t) => [t.id, products.filter((p) => p.productType === t.id).length]),
  );
  const verified = maker.approvedAt
    ? new Date(maker.approvedAt).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })
    : null;

  const stats = [
    {
      label: 'Rating',
      value: maker.reviewCount ? `★ ${maker.rating.toFixed(1)}` : '—',
      small: maker.reviewCount ? `(${maker.reviewCount})` : 'No reviews yet',
    },
    { label: 'Completed orders', value: String(maker.completedOrders) },
    {
      label: 'Usually replies',
      value:
        maker.responseTimeHours < 24
          ? `Within ${maker.responseTimeHours} hrs`
          : `Within ${Math.round(maker.responseTimeHours / 24)} ${Math.round(maker.responseTimeHours / 24) === 1 ? 'day' : 'days'}`,
    },
    { label: 'Made to order in', value: `${maker.leadTimeDays} days` },
  ];
  const facts = [
    { label: 'Process', value: maker.process },
    { label: 'Materials', value: maker.materials },
    { label: 'Sizing', value: maker.sizingNotes },
    { label: 'Lead time', value: `Made to order in ${maker.leadTimeDays} days` },
    { label: 'Based in', value: maker.location },
  ].filter((f) => f.value);

  return (
    <div>
      {preview && (
        <p
          className="follow-header fixed inset-x-0 top-[var(--header-offset)] z-40 bg-ink px-4 py-2 text-center text-[11px] uppercase tracking-label text-ground"
          role="status"
          data-testid="preview-banner-shop"
        >
          Preview, not live
        </p>
      )}
      <section
        data-hero
        className="relative -mt-[var(--header-h)] flex min-h-[520px] items-center justify-center overflow-hidden bg-ink text-ground md:min-h-[620px]"
      >
        <Image
          src={maker.coverUrl ?? DEFAULT_MAKER_BANNER}
          alt={`${maker.displayName} studio`}
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <span aria-hidden className="absolute inset-0 bg-[rgba(0,0,0,0.28)]" />
        <div className="relative px-4 pt-[var(--header-h)] text-center">
          <p className="text-[11px] uppercase tracking-wide2">{maker.location}</p>
          <h1 className="mt-3 text-[64px] leading-[0.92] md:text-[120px]">{maker.displayName}</h1>
          <p className="mt-4 inline-flex items-center gap-2 text-[11px] uppercase tracking-wide2">
            <CheckIcon width={14} height={14} /> Verified maker
            {verified ? ` · approved ${verified}` : ''}
          </p>
          <div className="mt-8 flex justify-center">
            <BoxButtonGroup className="w-full max-w-[600px] grid-flow-row sm:grid-flow-col">
              <FollowButton
                makerId={maker.id}
                following={following}
                makerName={maker.displayName}
                look="box"
              />
              <form action={openMakerThreadAction} className="flex">
                <input type="hidden" name="makerId" value={maker.id} />
                <input type="hidden" name="returnTo" value={`/makers/${maker.slug}`} />
                <button className={boxButtonClass('w-full')}>Ask a question</button>
              </form>
              {maker.customCommissionsEnabled && (
                <Link href={`/makers/${maker.slug}/commission`} className={boxButtonClass()}>
                  Request a custom piece
                </Link>
              )}
            </BoxButtonGroup>
          </div>
        </div>
      </section>
      {maker.shopStatus === 'holiday' && (
        <div className="container-page mt-6">
          <HolidayBanner
            message={
              SITE.holidayMode === 'accept_orders'
                ? holidayMessage(maker.holidayUntil)
                : `Back ${maker.holidayUntil ? new Date(shipsFrom(maker.holidayUntil)).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : 'soon'}. Follow to hear when they’re open.`
            }
            note={maker.holidayNote}
          />
        </div>
      )}

      <dl className="grid grid-cols-2 border-b border-line md:grid-cols-4">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className={`px-4 py-5 text-center ${i % 2 === 0 ? 'border-r border-line' : 'md:border-r'} ${i < 2 ? 'border-b border-line md:border-b-0' : ''} md:last:border-r-0`}
          >
            <dt className="text-[10px] uppercase tracking-label text-muted-2">{s.label}</dt>
            <dd className="mt-1 font-display text-[28px] leading-none md:text-[32px]">
              {s.value}{' '}
              {s.small && <span className="font-sans text-[12px] text-muted-2">{s.small}</span>}
            </dd>
          </div>
        ))}
      </dl>

      <section className="container-page grid gap-12 py-16 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:gap-20 md:py-20">
        <div>
          <p className="eyebrow">About the studio</p>
          {maker.tagline && <p className="mt-4 text-[17px] text-muted">{maker.tagline}</p>}
          {maker.story && (
            <p className="mt-4 font-display text-[28px] leading-[1.18] md:text-[36px]">
              {maker.story}
            </p>
          )}
        </div>
        <dl className="self-start border-t border-ink">
          {facts.map((f) => (
            <div
              key={f.label}
              className="grid grid-cols-[110px_1fr] gap-4 border-b border-line py-3.5 text-[13px]"
            >
              <dt className="text-[10px] uppercase tracking-label text-muted-2">{f.label}</dt>
              <dd className="text-right">{f.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="pieces">
        <h2 id="pieces" className="sr-only">
          Pieces
        </h2>
        <nav
          aria-label="Filter pieces"
          className="bleed flex items-center gap-6 border-y border-line"
        >
          <Link
            href={`/makers/${maker.slug}`}
            scroll={false}
            className={`flex min-h-[52px] items-center text-[11px] uppercase tracking-label ${!type ? 'underline underline-offset-[6px]' : ''}`}
          >
            All ({products.length})
          </Link>
          {TABS.filter((t) => counts[t.id]).map((t) => (
            <Link
              key={t.id}
              href={`/makers/${maker.slug}?type=${t.id}`}
              scroll={false}
              className={`flex min-h-[52px] items-center text-[11px] uppercase tracking-label ${type === t.id ? 'underline underline-offset-[6px]' : ''}`}
            >
              {t.label} ({counts[t.id]})
            </Link>
          ))}
          <span className="ml-auto hidden text-[11px] uppercase tracking-label text-muted-2 sm:inline">
            {shown.length} pieces
          </span>
        </nav>
        {shown.length ? (
          <ProductGrid
            products={shown}
            savedIds={saved}
            every={7}
            editorial={
              maker.process
                ? [
                    {
                      kicker: 'From the studio',
                      title: maker.process,
                      cta: 'Ask the maker',
                      href: `/makers/${maker.slug}/ask`,
                      imageUrl: '/seed/editorial/studio.svg',
                    },
                  ]
                : []
            }
          />
        ) : (
          <div className="container-page py-10">
            <EmptyState title="New pieces coming soon">
              Follow {maker.displayName} to see new pieces first.
            </EmptyState>
          </div>
        )}
      </section>

      <section id="reviews" aria-labelledby="maker-reviews" className="container-page mt-20">
        <h2 id="maker-reviews" className="text-[44px] leading-none md:text-[56px]">
          Reviews
        </h2>
        <p className="mb-6 mt-2 text-[13px] text-muted">
          {maker.reviewCount
            ? `★ ${maker.rating.toFixed(1)} from ${maker.reviewCount} buyers. `
            : ''}
          Only buyers with delivered orders can review.
        </p>
        <Reviews reviews={reviews} emptyText={`${maker.displayName} hasn’t been reviewed yet.`} />
      </section>
    </div>
  );
}
