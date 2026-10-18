import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Img as Image } from '@/components/ui/Img';
import { getSessionUser } from '@/lib/auth/session';
import { getMaker, getReviews, getSavedProductIds, isFollowing } from '@/lib/queries/catalog';
import { FollowButton } from '@/components/maker/FollowButton';
import { responseTimeLabel } from '@/components/maker/MakerByline';
import { ProductGrid } from '@/components/product/ProductCard';
import { Reviews } from '@/components/product/Reviews';
import { EmptyState } from '@/components/ui/EmptyState';
import { Stars } from '@/components/ui/Stars';
import { buttonClass } from '@/components/ui/Button';
import { ChatIcon, NeedleIcon } from '@/components/ui/icons';

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const data = await getMaker(params.slug);
  return {
    title: data?.maker.displayName ?? 'Maker',
    description: data?.maker.tagline ?? undefined,
  };
}

export default async function MakerPage({ params }: { params: { slug: string } }) {
  const data = await getMaker(params.slug);
  if (!data) notFound();
  const { maker, products } = data;
  const user = await getSessionUser();
  const [following, saved, reviews] = await Promise.all([
    isFollowing(user?.id ?? null, maker.id),
    getSavedProductIds(user?.id ?? null),
    getReviews({ makerId: maker.id }, 6),
  ]);
  const askHref = `/makers/${maker.slug}/ask`;

  const facts = [
    { label: 'Based in', value: maker.location },
    { label: 'Production lead time', value: `${maker.leadTimeDays} days for made-to-order` },
    { label: 'Response time', value: responseTimeLabel(maker.responseTimeHours) },
    { label: 'Completed orders', value: String(maker.completedOrders) },
  ];

  return (
    <div>
      <div className="relative h-44 bg-stone-light sm:h-64 lg:h-80">
        {maker.coverUrl && (
          <Image
            src={maker.coverUrl}
            alt={`${maker.displayName} studio`}
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        )}
      </div>
      <div className="container-page">
        <div className="relative -mt-12 flex flex-col gap-5 sm:-mt-14 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
            <span className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full border-4 border-paper bg-stone-light sm:h-28 sm:w-28">
              {maker.avatarUrl && (
                <Image src={maker.avatarUrl} alt="" fill sizes="112px" className="object-cover" />
              )}
            </span>
            <div className="pb-1">
              <h1 className="text-3xl leading-tight sm:text-4xl">{maker.displayName}</h1>
              <p className="mt-1 text-sm text-ink-muted">
                {maker.location} · {maker.followerCount} follower
                {maker.followerCount === 1 ? '' : 's'}
                {maker.reviewCount > 0 && (
                  <>
                    {' · '}
                    <Stars rating={maker.rating} count={maker.reviewCount} size={12} />
                  </>
                )}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <FollowButton makerId={maker.id} following={following} makerName={maker.displayName} />
            <Link href={askHref} className={buttonClass('secondary', 'md')}>
              <ChatIcon width={18} height={18} /> Ask a question
            </Link>
            {maker.customCommissionsEnabled && (
              <Link
                href={`/makers/${maker.slug}/commission`}
                className={buttonClass('secondary', 'md')}
              >
                <NeedleIcon width={18} height={18} /> Request a custom piece
              </Link>
            )}
          </div>
        </div>

        {maker.tagline && (
          <p className="mt-6 max-w-2xl font-display text-xl text-ink-soft sm:text-2xl">
            {maker.tagline}
          </p>
        )}

        <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6 text-[15px] leading-relaxed text-ink-soft">
            {maker.story && (
              <section>
                <h2 className="mb-1 font-sans text-sm font-semibold uppercase tracking-wider text-ink">
                  Our story
                </h2>
                <p className="whitespace-pre-line">{maker.story}</p>
              </section>
            )}
            {maker.process && (
              <section>
                <h2 className="mb-1 font-sans text-sm font-semibold uppercase tracking-wider text-ink">
                  Process
                </h2>
                <p>{maker.process}</p>
              </section>
            )}
            {maker.materials && (
              <section>
                <h2 className="mb-1 font-sans text-sm font-semibold uppercase tracking-wider text-ink">
                  Materials
                </h2>
                <p>{maker.materials}</p>
              </section>
            )}
            {maker.sizingNotes && (
              <section>
                <h2 className="mb-1 font-sans text-sm font-semibold uppercase tracking-wider text-ink">
                  Sizing approach
                </h2>
                <p>{maker.sizingNotes}</p>
              </section>
            )}
          </div>
          <dl className="card h-fit divide-y divide-stone/70">
            {facts.map((f) => (
              <div key={f.label} className="px-4 py-3">
                <dt className="text-xs text-ink-muted">{f.label}</dt>
                <dd className="text-sm font-medium">{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <section aria-labelledby="pieces" className="mt-14">
          <h2 id="pieces" className="mb-5 text-2xl">
            Available pieces
          </h2>
          {products.length ? (
            <ProductGrid products={products} savedIds={saved} />
          ) : (
            <EmptyState title="New pieces coming soon">
              Follow {maker.displayName} to see new pieces first.
            </EmptyState>
          )}
        </section>

        <section aria-labelledby="maker-reviews" className="mt-14 max-w-3xl">
          <h2 id="maker-reviews" className="text-2xl">
            Reviews
          </h2>
          <Reviews reviews={reviews} emptyText={`${maker.displayName} hasn’t been reviewed yet.`} />
        </section>
      </div>
    </div>
  );
}
