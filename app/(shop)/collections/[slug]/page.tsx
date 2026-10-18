import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getCollection, getSavedProductIds } from '@/lib/queries/catalog';
import { ProductGrid } from '@/components/product/ProductCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { ButtonLink } from '@/components/ui/Button';

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

export default async function CollectionPage({ params }: { params: { slug: string } }) {
  const data = await getCollection(params.slug);
  if (!data) notFound();
  const user = await getSessionUser();
  const saved = await getSavedProductIds(user?.id ?? null);
  const { collection, products } = data;
  return (
    <div className="container-page pt-8">
      <header className="max-w-2xl">
        <p className="eyebrow">Collection</p>
        <h1 className="mt-2 text-4xl leading-tight sm:text-5xl">{collection.title}</h1>
        {collection.subtitle && <p className="mt-3 text-lg text-ink-soft">{collection.subtitle}</p>}
        {collection.description && <p className="mt-2 text-ink-muted">{collection.description}</p>}
      </header>
      <div className="mt-10">
        {products.length ? (
          <ProductGrid products={products} savedIds={saved} />
        ) : (
          <EmptyState
            title="This edit is being restocked"
            action={
              <ButtonLink href="/?tab=new" variant="secondary">
                Explore new arrivals
              </ButtonLink>
            }
          >
            Check back soon, or explore what’s new this week.
          </EmptyState>
        )}
      </div>
    </div>
  );
}
