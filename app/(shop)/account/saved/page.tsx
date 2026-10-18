import { requireUser } from '@/lib/auth/session';
import { getSavedIds } from '@/lib/queries/account';
import { getCardsByIds } from '@/lib/queries/catalog';
import { ProductGrid } from '@/components/product/ProductCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { ButtonLink } from '@/components/ui/Button';

export const metadata = { title: 'Saved' };

export default async function SavedPage() {
  const user = await requireUser('/account/saved');
  const ids = await getSavedIds(user);
  const products = await getCardsByIds(ids);
  return (
    <div>
      <h1 className="mb-6 text-3xl">Saved pieces</h1>
      {products.length ? (
        <ProductGrid products={products} savedIds={new Set(ids)} />
      ) : (
        <EmptyState
          title="Nothing saved yet"
          action={<ButtonLink href="/">Discover pieces</ButtonLink>}
        >
          Tap the heart on any piece to keep it here.
        </EmptyState>
      )}
    </div>
  );
}
