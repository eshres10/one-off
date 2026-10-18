import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import {
  getCollection,
  getFacetOptions,
  getFeed,
  getSavedProductIds,
  parseFilters,
} from '@/lib/queries/catalog';
import { FilterBar } from '@/components/feed/FilterBar';
import { ProductGrid } from '@/components/product/ProductCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { ButtonLink } from '@/components/ui/Button';
import { Img as Image } from '@/components/ui/Img';

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const data = await getCollection(params.slug);
  return {
    title: data?.collection.title ?? 'Collection',
    description: data?.collection.description ?? undefined,
  };
}

export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const data = await getCollection(params.slug);
  if (!data) notFound();
  const user = await getSessionUser();
  const [saved, options] = await Promise.all([
    getSavedProductIds(user?.id ?? null),
    getFacetOptions(),
  ]);
  const { collection } = data;
  const filters = parseFilters(searchParams);
  const { items: products } = await getFeed({ ...filters, tab: 'for-you' }, user?.id ?? null, {
    collectionId: collection.id,
    limit: 200,
  });
  return (
    <div>
      <section className="relative -mt-[60px] flex min-h-[460px] items-end overflow-hidden text-ground md:-mt-[76px] md:min-h-[560px]">
        {collection.heroImageUrl && (
          <Image
            src={collection.heroImageUrl}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        )}
        <span
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-black/10"
        />
        <div className="container-page relative pb-10 md:pb-14">
          <p className="text-[11px] uppercase tracking-wide2">
            Collection · {data.products.length} pieces
          </p>
          <h1 className="mt-3 max-w-[16ch] text-[56px] leading-[0.92] md:text-[96px]">
            {collection.title}
          </h1>
        </div>
      </section>
      {(collection.subtitle || collection.description) && (
        <div className="container-page grid gap-4 py-10 md:grid-cols-2 md:py-14">
          {collection.subtitle && (
            <p className="font-display text-[28px] leading-tight md:text-[34px]">
              {collection.subtitle}
            </p>
          )}
          {collection.description && (
            <p className="text-[15px] text-muted">{collection.description}</p>
          )}
        </div>
      )}
      <FilterBar options={options} />
      <div className="mt-[2px]">
        {products.length ? (
          <ProductGrid products={products} savedIds={saved} />
        ) : (
          <div className="container-page py-10">
            <EmptyState
              title="No pieces match those filters yet."
              action={
                <ButtonLink href={`/collections/${collection.slug}`} variant="secondary">
                  Clear filters
                </ButtonLink>
              }
            >
              Try removing a filter or explore the whole edit.
            </EmptyState>
          </div>
        )}
      </div>
    </div>
  );
}
