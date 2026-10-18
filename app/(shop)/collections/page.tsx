import { getCollections } from '@/lib/queries/catalog';
import { CollectionCard } from '@/components/editorial/CollectionCard';
import { PageTitle } from '@/components/ui/Panels';

export const metadata = { title: 'Collections' };

export default async function CollectionsPage() {
  const collections = await getCollections();
  return (
    <div className="pt-10 md:pt-16">
      <div className="container-page">
        <PageTitle kicker="Curated edits" title="Collections">
          Hand-picked edits from independent Australian studios, updated as new pieces arrive.
        </PageTitle>
      </div>
      <ul className="grid gap-[2px] md:grid-cols-2" role="list">
        {collections.map((c) => (
          <li key={c.id}>
            <CollectionCard collection={c} />
          </li>
        ))}
      </ul>
    </div>
  );
}
