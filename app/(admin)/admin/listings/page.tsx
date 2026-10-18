import Link from 'next/link';
import { Img as Image } from '@/components/ui/Img';
import { sql } from '@/lib/db';
import { listingStatusAction } from '@/lib/actions/admin';
import { formatPrice } from '@/lib/domain/money';
import { StatusPill, ProductBadgePill } from '@/components/ui/Badge';
import type { ProductType } from '@/lib/domain/types';

export const metadata = { title: 'Listings' };

export default async function AdminListingsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const status = ['pending', 'approved', 'rejected', 'archived', 'draft'].includes(
    searchParams.status ?? '',
  )
    ? searchParams.status!
    : 'pending';
  const rows = await sql()<
    {
      id: string;
      slug: string;
      title: string;
      status: string;
      productType: ProductType;
      priceCents: number;
      isFeatured: boolean;
      makerName: string;
      makerStatus: string;
      imageUrl: string | null;
      imageCount: number;
      leadTimeDays: number | null;
      updatedAt: Date;
    }[]
  >`
    select p.id, p.slug, p.title, p.status, p.product_type, p.price_cents, p.is_featured, p.lead_time_days, p.updated_at,
           m.display_name as maker_name, m.status as maker_status,
           (select public_url from public.product_images i where i.product_id = p.id order by sort_order limit 1) as image_url,
           (select count(*) from public.product_images i where i.product_id = p.id)::int as image_count
    from public.products p join public.makers m on m.id = p.maker_id
    where p.status = ${status}
    order by p.updated_at desc limit 200`;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl">Listings</h1>
      <nav className="flex flex-wrap gap-2" aria-label="Listing status">
        {['pending', 'approved', 'rejected', 'draft', 'archived'].map((s) => (
          <Link
            key={s}
            href={`/admin/listings?status=${s}`}
            className={`rounded-full px-3 py-1.5 text-sm capitalize ${status === s ? 'bg-ink text-paper' : 'border border-stone'}`}
          >
            {s}
          </Link>
        ))}
      </nav>
      {rows.length === 0 && <p className="text-sm text-ink-muted">Nothing here.</p>}
      <ul className="space-y-3" role="list">
        {rows.map((p) => (
          <li
            key={p.id}
            className="card flex flex-wrap items-center gap-4 p-4"
            data-testid="admin-listing"
          >
            <span className="relative aspect-4/5 w-16 shrink-0 overflow-hidden rounded-md bg-stone-light">
              {p.imageUrl && (
                <Image src={p.imageUrl} alt="" fill sizes="64px" className="object-cover" />
              )}
            </span>
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium">
                {p.title}{' '}
                {p.isFeatured && (
                  <span className="ml-1 rounded bg-clay-light px-1.5 text-xs text-clay">
                    Featured
                  </span>
                )}
              </p>
              <p className="text-ink-muted">
                {p.makerName} ({p.makerStatus}) · {formatPrice(p.priceCents)} · {p.imageCount}{' '}
                photos{p.leadTimeDays ? ` · ${p.leadTimeDays}d lead time` : ''}
              </p>
              <div className="mt-1 flex gap-2">
                <ProductBadgePill badge={p.productType} className="border border-stone/70" />
                <StatusPill status={p.status} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/products/${p.slug}`} className="text-xs underline">
                {p.status === 'approved' ? 'View' : 'Preview'}
              </Link>
              {p.status !== 'approved' && (
                <form action={listingStatusAction}>
                  <input type="hidden" name="productId" value={p.id} />
                  <input type="hidden" name="status" value="approved" />
                  <button className="rounded-full bg-ink px-3 py-1.5 text-xs text-paper">
                    Approve
                  </button>
                </form>
              )}
              {p.status === 'pending' && (
                <form action={listingStatusAction} className="flex gap-1">
                  <input type="hidden" name="productId" value={p.id} />
                  <input type="hidden" name="status" value="rejected" />
                  <input
                    name="reason"
                    placeholder="What needs changing?"
                    aria-label="Rejection reason"
                    className="input w-44 py-1 text-xs"
                  />
                  <button className="rounded-full border border-alert px-3 py-1.5 text-xs text-alert">
                    Reject
                  </button>
                </form>
              )}
              {p.status === 'approved' && (
                <>
                  <form action={listingStatusAction}>
                    <input type="hidden" name="productId" value={p.id} />
                    <input
                      type="hidden"
                      name="status"
                      value={p.isFeatured ? 'unfeature' : 'feature'}
                    />
                    <button className="rounded-full border border-stone px-3 py-1.5 text-xs">
                      {p.isFeatured ? 'Unfeature' : 'Feature'}
                    </button>
                  </form>
                </>
              )}
              {p.status !== 'archived' && (
                <form action={listingStatusAction}>
                  <input type="hidden" name="productId" value={p.id} />
                  <input type="hidden" name="status" value="archived" />
                  <button className="rounded-full border border-stone px-3 py-1.5 text-xs text-ink-muted">
                    Archive
                  </button>
                </form>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
