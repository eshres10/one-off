import Link from 'next/link';
import { sql } from '@/lib/db';
import { collectionProductAction, placementAction } from '@/lib/actions/admin';
import { CollectionForm } from '@/components/admin/CollectionForm';

export const metadata = { title: 'Collections & homepage' };

export default async function AdminCollectionsPage() {
  const collections = await sql()<
    {
      id: string;
      slug: string;
      title: string;
      subtitle: string | null;
      description: string | null;
      sortOrder: number;
      isActive: boolean;
    }[]
  >`
    select id, slug, title, subtitle, description, sort_order, is_active from public.collections order by sort_order, title`;
  const members = await sql()<{ collectionId: string; slug: string; title: string }[]>`
    select cp.collection_id, p.slug, p.title from public.collection_products cp join public.products p on p.id = cp.product_id order by cp.sort_order`;
  const placements = await sql()<
    {
      id: string;
      slot: string;
      title: string;
      subtitle: string | null;
      href: string;
      isActive: boolean;
    }[]
  >`
    select id, slot, title, subtitle, href, is_active from public.editorial_placements order by slot, sort_order`;
  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h1 className="text-3xl">Homepage placements</h1>
        {placements.map((p) => (
          <form key={p.id} action={placementAction} className="card grid gap-2 p-3 sm:grid-cols-6">
            <input type="hidden" name="id" value={p.id} />
            <span className="self-center font-mono text-xs text-ink-muted">{p.slot}</span>
            <input
              name="title"
              defaultValue={p.title}
              aria-label="Title"
              className="input py-1.5 text-sm sm:col-span-2"
            />
            <input
              name="subtitle"
              defaultValue={p.subtitle ?? ''}
              aria-label="Subtitle"
              className="input py-1.5 text-sm"
            />
            <input
              name="href"
              defaultValue={p.href}
              aria-label="Link"
              className="input py-1.5 text-sm"
            />
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-xs">
                <input type="checkbox" name="isActive" defaultChecked={p.isActive} /> Live
              </label>
              <button className="rounded-full bg-ink px-3 py-1 text-xs text-paper">Save</button>
            </div>
          </form>
        ))}
      </section>
      <section className="space-y-4">
        <h2 className="text-2xl">Collections</h2>
        <div className="card p-4">
          <p className="mb-2 text-sm font-medium">New collection</p>
          <CollectionForm />
        </div>
        {collections.map((c) => (
          <div key={c.id} className="card space-y-3 p-4">
            <div className="flex items-center justify-between">
              <Link href={`/collections/${c.slug}`} className="font-medium hover:underline">
                {c.title}
              </Link>
              <span className="text-xs text-ink-muted">
                {members.filter((m) => m.collectionId === c.id).length} pieces
              </span>
            </div>
            <CollectionForm collection={c} />
            <div className="flex flex-wrap gap-1.5">
              {members
                .filter((m) => m.collectionId === c.id)
                .map((m) => (
                  <form key={m.slug} action={collectionProductAction}>
                    <input type="hidden" name="collectionId" value={c.id} />
                    <input type="hidden" name="productSlug" value={m.slug} />
                    <input type="hidden" name="op" value="remove" />
                    <button
                      className="rounded-full bg-stone-light px-2.5 py-1 text-xs hover:bg-alert-light"
                      aria-label={`Remove ${m.title}`}
                    >
                      {m.title} ×
                    </button>
                  </form>
                ))}
            </div>
            <form action={collectionProductAction} className="flex gap-2">
              <input type="hidden" name="collectionId" value={c.id} />
              <input type="hidden" name="op" value="add" />
              <input
                name="productSlug"
                placeholder="Add product by URL slug"
                aria-label="Product slug"
                className="input w-64 py-1.5 text-sm"
              />
              <button className="rounded-full border border-ink px-3 text-xs">Add</button>
            </form>
          </div>
        ))}
      </section>
    </div>
  );
}
