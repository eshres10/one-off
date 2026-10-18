import { getCollections } from '@/lib/queries/catalog';
import { CollectionCard } from '@/components/editorial/CollectionCard';

export const metadata = { title: 'Collections' };

export default async function CollectionsPage() {
  const collections = await getCollections();
  return (
    <div className="container-page pt-8">
      <p className="eyebrow">Curated edits</p>
      <h1 className="mt-2 text-4xl sm:text-5xl">Collections</h1>
      <p className="mt-3 max-w-xl text-ink-soft">
        Hand-picked edits from independent Australian studios — updated as new pieces arrive.
      </p>
      <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3" role="list">
        {collections.map((c) => (
          <li key={c.id}>
            <CollectionCard collection={c} />
          </li>
        ))}
      </ul>
    </div>
  );
}
