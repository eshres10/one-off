import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import {
  PAGE_SIZE,
  activeFilterCount,
  getFeed,
  getSavedProductIds,
  type FeedFilters,
} from '@/lib/queries/catalog';
import { getFollowedMakers } from '@/lib/queries/saved';
import {
  getFollowedMakerIds,
  getMostPopular,
  getNewMakers,
  getPickedForYou,
} from '@/lib/queries/rails';
import { formatPrice } from '@/lib/domain/money';
import { Img as Image } from '@/components/ui/Img';
import { ArrowRightIcon } from '@/components/ui/icons';
import { FollowButton } from '@/components/maker/FollowButton';
import { PhoneProductGrid } from '../ProductGrid';
import { Chip } from '../ui';
import { EndlessFeed } from './EndlessFeed';
import { PullToRefresh } from './PullToRefresh';

const PILLS = [
  {
    label: 'For you',
    href: '/',
    on: (f: FeedFilters) => f.tab === 'for-you' && activeFilterCount(f) === 0,
  },
  { label: 'Following', href: '/?tab=following', on: (f: FeedFilters) => f.tab === 'following' },
  { label: 'New in', href: '/?tab=new', on: (f: FeedFilters) => f.tab === 'new' },
  {
    label: 'Made to order',
    href: '/?type=made_to_order',
    on: (f: FeedFilters) => f.type === 'made_to_order',
  },
  { label: 'Under A$300', href: '/?maxPrice=300', on: (f: FeedFilters) => f.maxPrice === 300 },
];

const TRUST = [
  'Payment held until it arrives',
  'Made to your measurements',
  'Shipped from the studio',
  'Every maker met in person',
];

function queryOf(f: FeedFilters) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === '' || k === 'page' || (k === 'tab' && v === 'for-you')) continue;
    p.set(k, String(v));
  }
  return p.toString();
}

/**
 * Home on phones: feed pills, the hero card, trust pills, makers you follow, Picked for you,
 * Most popular, the Have it made card, more pieces, new makers and the endless feed.
 */
export async function PhoneHome({
  filters,
  hero,
}: {
  filters: FeedFilters;
  hero: { title: string; subtitle: string; imageUrl: string | null };
}) {
  const user = await getSessionUser();
  const isDefault = filters.tab === 'for-you' && activeFilterCount(filters) === 0;
  const query = queryOf(filters);
  const [{ items, hasMore }, savedIds] = await Promise.all([
    getFeed({ ...filters, page: 1 }, user?.id ?? null),
    getSavedProductIds(user?.id ?? null),
  ]);
  const [followed, picked, popular, newMakers, followingIds] = isDefault
    ? await Promise.all([
        user ? getFollowedMakers(user).catch(() => []) : Promise.resolve([]),
        user ? getPickedForYou(user.id, 4) : Promise.resolve([]),
        getMostPopular(5),
        getNewMakers(6),
        getFollowedMakerIds(user?.id ?? null),
      ])
    : [[], [], [], [], new Set<string>()];
  const pickedFour = picked.length ? picked.slice(0, 4) : items.slice(0, 4);
  const rest = picked.length ? items : items.slice(4);
  const moreFour = rest.slice(0, 4);
  const tail = rest.slice(4);

  const pills = (
    <div
      className="no-scrollbar sticky top-[var(--header-offset)] z-30 -mx-4 flex gap-2 overflow-x-auto bg-ground/95 px-4 py-2.5 backdrop-blur"
      aria-label="Feed"
    >
      {PILLS.map((p) => (
        <Chip
          key={p.label}
          href={p.href}
          pressed={p.on(filters)}
          testId={`pill-${p.label.toLowerCase().replace(/[^a-z]+/g, '-')}`}
        >
          {p.label}
        </Chip>
      ))}
    </div>
  );

  if (!isDefault)
    return (
      <div className="px-4 pb-6" data-testid="phone-home-feed">
        {pills}
        <div className="-mx-4 mt-2">
          {items.length ? (
            <EndlessFeed
              query={query}
              startPage={2}
              initialHasMore={hasMore}
              initial={items}
              savedIds={[...savedIds]}
            />
          ) : (
            <p className="px-6 py-16 text-center text-[13px] text-muted">
              {filters.tab === 'following' && !user
                ? 'Sign in to see pieces from makers you follow.'
                : 'Nothing here yet.'}
            </p>
          )}
        </div>
      </div>
    );

  return (
    <PullToRefresh>
      <div className="px-4 pb-6" data-testid="phone-home">
        {pills}
        <section
          className="relative mt-2 h-[420px] overflow-hidden rounded-app bg-stone text-ground"
          aria-label={hero.title}
          data-testid="hero-card"
        >
          {hero.imageUrl && (
            <Image
              src={hero.imageUrl}
              alt=""
              fill
              priority
              sizes="100vw"
              quality={70}
              className="object-cover object-[center_30%]"
            />
          )}
          <span
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-black/10"
          />
          <div className="absolute inset-x-5 bottom-5">
            <p className="text-[10px] uppercase tracking-wide2">{hero.subtitle}</p>
            <p className="mt-2 max-w-[11ch] font-display text-[40px] leading-[0.95]">
              {hero.title}
            </p>
            <div className="mt-4 flex gap-2">
              <Link
                href="/discover"
                className="flex min-h-[44px] flex-1 items-center justify-center rounded-app bg-surface text-[11px] uppercase tracking-[0.16em] text-ink"
              >
                Shop the edit
              </Link>
              <Link
                href="/makers"
                className="flex min-h-[44px] flex-1 items-center justify-center rounded-app border border-ground/80 text-[11px] uppercase tracking-[0.16em]"
              >
                The makers
              </Link>
            </div>
          </div>
        </section>

        <ul
          className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4"
          role="list"
          aria-label="Why Off One"
        >
          {TRUST.map((t) => (
            <li key={t} className="shrink-0 rounded-pill bg-stone px-3 py-1.5 text-[12px]">
              {t}
            </li>
          ))}
        </ul>

        {followed.length > 0 && (
          <section className="mt-6" aria-labelledby="followed-title">
            <h2 id="followed-title" className="text-[11px] uppercase tracking-label text-muted-2">
              Makers you follow
            </h2>
            <ul
              className="no-scrollbar -mx-4 mt-3 flex gap-4 overflow-x-auto px-4"
              role="list"
              data-testid="followed-makers"
            >
              {followed.map((mk) => {
                const fresh = /new piece/.test(mk.news);
                return (
                  <li key={mk.id} className="w-[64px] shrink-0 text-center">
                    <Link href={`/makers/${mk.slug}`} className="block">
                      <span
                        className={`mx-auto flex h-[64px] w-[64px] items-center justify-center rounded-circle ${fresh ? 'bg-gradient-to-br from-[#8A2E1C] to-ink p-[2px]' : 'bg-line p-px'}`}
                      >
                        <span className="relative block h-full w-full overflow-hidden rounded-circle border-2 border-ground bg-stone">
                          {mk.avatarUrl && (
                            <Image
                              src={mk.avatarUrl}
                              alt=""
                              fill
                              sizes="64px"
                              className="object-cover"
                            />
                          )}
                        </span>
                      </span>
                      <span className="mt-1.5 block truncate text-[11px]">
                        {mk.displayName.split(' ')[0]}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="mt-6" aria-labelledby="picked-title">
          <h2 id="picked-title" className="font-display text-[26px]">
            Picked for you
          </h2>
          <div className="-mx-4 mt-3">
            <PhoneProductGrid products={pickedFour} savedIds={savedIds} />
          </div>
        </section>

        {popular.length > 0 && (
          <section className="mt-6" aria-labelledby="popular-title">
            <h2 id="popular-title" className="font-display text-[26px]">
              Most popular
            </h2>
            <ul
              className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4"
              role="list"
              data-testid="popular-rail"
            >
              {popular.map((p, i) => (
                <li key={p.id} className="w-[200px] shrink-0">
                  <Link href={`/products/${p.slug}`} className="block" aria-label={p.title}>
                    <span className="relative block aspect-4/5 overflow-hidden rounded-app bg-stone">
                      {p.imageUrl && (
                        <Image
                          src={p.imageUrl}
                          alt=""
                          fill
                          sizes="200px"
                          className="object-cover object-top"
                        />
                      )}
                      <span className="absolute left-3 top-2 font-display text-[44px] leading-none text-ground drop-shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                    </span>
                    <span className="mt-1.5 flex items-baseline justify-between text-[13px]">
                      <span className="font-medium">{formatPrice(p.priceCents)}</span>
                      <span className="text-[11px] text-muted-2">{p.saveCount} saves</span>
                    </span>
                    <span className="block truncate text-[12px] text-muted">{p.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <Link
          href="/have-it-made"
          className="mt-6 flex items-center justify-between gap-4 rounded-app bg-ink px-5 py-5 text-ground"
          data-testid="home-have-it-made"
        >
          <span>
            <span className="block text-[10px] uppercase tracking-[0.2em] text-ground/70">
              Something in mind?
            </span>
            <span className="mt-1 block font-display text-[26px] leading-none">Have it made</span>
            <span className="mt-1.5 block text-[12px] text-ground/75">
              Tell us the piece. Up to 3 makers quote within 48 hours.
            </span>
          </span>
          <ArrowRightIcon width={22} height={22} className="shrink-0" />
        </Link>

        {moreFour.length > 0 && (
          <section className="mt-6" aria-labelledby="more-title">
            <h2 id="more-title" className="font-display text-[26px]">
              More pieces
            </h2>
            <div className="-mx-4 mt-3">
              <PhoneProductGrid products={moreFour} savedIds={savedIds} priorityCount={0} />
            </div>
          </section>
        )}

        {newMakers.length > 0 && (
          <section className="mt-6" aria-labelledby="new-makers-title">
            <h2 id="new-makers-title" className="font-display text-[26px]">
              New makers
            </h2>
            <ul
              className="no-scrollbar -mx-4 mt-3 flex gap-3 overflow-x-auto px-4"
              role="list"
              data-testid="new-makers-rail"
            >
              {newMakers.map((mk) => (
                <li
                  key={mk.id}
                  className="w-[260px] shrink-0 overflow-hidden rounded-app border border-line bg-surface"
                >
                  <Link href={`/makers/${mk.slug}`} className="relative block h-[120px] bg-stone">
                    {(mk.coverUrl ?? mk.avatarUrl) && (
                      <Image
                        src={(mk.coverUrl ?? mk.avatarUrl)!}
                        alt=""
                        fill
                        sizes="260px"
                        className="object-cover"
                      />
                    )}
                  </Link>
                  <div className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block truncate font-display text-[20px] leading-tight">
                          {mk.displayName}
                        </span>
                        <span className="block truncate text-[11px] uppercase tracking-label text-muted-2">
                          {[mk.suburb, mk.tagline].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <FollowButton
                        makerId={mk.id}
                        following={followingIds.has(mk.id)}
                        makerName={mk.displayName}
                        look="rail"
                      />
                    </div>
                    {mk.thumbs.length > 0 && (
                      <ul className="mt-3 grid grid-cols-3 gap-[2px]" role="list">
                        {mk.thumbs.map((t) => (
                          <li key={t.slug}>
                            <Link
                              href={`/products/${t.slug}`}
                              className="relative block aspect-4/5 overflow-hidden rounded-[6px] bg-stone"
                              aria-label={t.title}
                            >
                              {t.imageUrl && (
                                <Image
                                  src={t.imageUrl}
                                  alt=""
                                  fill
                                  sizes="80px"
                                  className="object-cover object-top"
                                />
                              )}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-6" aria-labelledby="more-for-you">
          <h2 id="more-for-you" className="font-display text-[26px]">
            More for you
          </h2>
          <div className="-mx-4 mt-3">
            <EndlessFeed
              query={query}
              startPage={2}
              initialHasMore={hasMore}
              initial={tail}
              savedIds={[...savedIds]}
            />
          </div>
        </section>
      </div>
    </PullToRefresh>
  );
}
