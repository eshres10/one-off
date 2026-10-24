import Link from 'next/link';
import { sql } from '@/lib/db';
import { collectionProductAction, placementAction } from '@/lib/actions/admin';
import { CollectionForm } from '@/components/admin/CollectionForm';
import { CollectionOrder } from '@/components/admin/CollectionOrder';
import { FeaturedMakerForm } from '@/components/admin/FeaturedMakerForm';
import { formatPrice } from '@/lib/domain/money';
import { adminHomeFeature } from '@/lib/services/home-feature';
import { stopFeatureAction } from '@/lib/actions/admin';

export const metadata = { title: 'Collections & homepage' };

export default async function AdminCollectionsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const makerParam = Array.isArray(searchParams.maker) ? searchParams.maker[0] : searchParams.maker;
  const feature = await adminHomeFeature(makerParam);
  const selected = feature.makers.find((m) => m.id === feature.selectedMakerId) ?? null;
  const [selectedMaker] = selected
    ? await sql()<
        { tagline: string | null }[]
      >`select tagline from public.makers where id = ${selected.id}`
    : [];
  const collections = await sql()<
    {
      id: string;
      slug: string;
      title: string;
      subtitle: string | null;
      description: string | null;
      sortOrder: number;
      isActive: boolean;
      heroImageUrl: string | null;
    }[]
  >`
    select id, slug, title, subtitle, description, sort_order, is_active, hero_image_url from public.collections order by sort_order, title`;
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
      <section
        className="space-y-4"
        aria-labelledby="featured-maker"
        data-testid="featured-maker-card"
      >
        <h1 id="featured-maker" className="text-[40px] leading-none md:text-[48px]">
          Homepage · Featured maker
        </h1>
        {feature.active ? (
          <div className="card space-y-3 p-4" data-testid="feature-active">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm">
                Featuring{' '}
                <Link
                  href={`/makers/${feature.active.makerSlug}`}
                  className="font-medium hover:underline"
                >
                  {feature.active.makerName}
                </Link>{' '}
                since {feature.active.startsAt.toLocaleDateString('en-AU')}
                {feature.active.endsAt
                  ? `, until ${feature.active.endsAt.toLocaleDateString('en-AU')}`
                  : ''}
                .
              </p>
              <form action={stopFeatureAction}>
                <input type="hidden" name="id" value={feature.active.id} />
                <button className="min-h-[36px] border border-ink px-3 text-[11px] uppercase tracking-label">
                  Stop featuring
                </button>
              </form>
            </div>
            <ol className="flex gap-2 overflow-x-auto" aria-label="Pieces in rotation">
              {feature.active.pieces.map((p) => (
                <li key={p.id} className="w-[72px] shrink-0 text-[11px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.imageUrl} alt="" className="aspect-[3/4] w-full object-cover" />
                  <span className="mt-1 block truncate">{p.title}</span>
                  <span className="text-muted-2">{formatPrice(p.priceCents)}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <p className="text-sm text-ink-muted" data-testid="feature-none">
            No maker is featured, so the homepage shows the original hero.
          </p>
        )}
        <div className="card space-y-4 p-4">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-[12px] text-ink-muted">
              Maker (live shops only)
              <select
                name="maker"
                defaultValue={feature.selectedMakerId ?? ''}
                className="input min-h-[36px] py-1.5 text-sm"
                data-testid="feature-maker"
              >
                {feature.makers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="min-h-[36px] border border-ink px-4 text-[11px] uppercase tracking-label">
              Choose
            </button>
          </form>
          {selected && (
            <FeaturedMakerForm
              key={selected.id}
              makerId={selected.id}
              makerName={selected.name}
              pieces={feature.pieces}
              initial={
                feature.active && feature.active.makerId === selected.id
                  ? feature.active.pieces.map((p) => p.id)
                  : []
              }
            />
          )}
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="text-[32px] leading-none">Homepage placements</h2>
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
              <button className="glass-dark min-h-[44px] px-4 text-[10px] uppercase tracking-label">
                Save
              </button>
            </div>
          </form>
        ))}
      </section>
      <section className="space-y-4">
        <h2 className="text-[32px] leading-none">Collections</h2>
        <CollectionOrder
          initial={collections.map((c) => ({
            id: c.id,
            title: c.title,
            heroImageUrl: c.heroImageUrl,
          }))}
        />
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
                      className="min-h-[36px] bg-stone-light px-3 text-[12px] hover:bg-error-bg"
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
              <button className="min-h-[44px] border border-ink px-4 text-[10px] uppercase tracking-label">
                Add
              </button>
            </form>
          </div>
        ))}
      </section>
    </div>
  );
}
