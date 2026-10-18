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
  searchParams: { status?: string; preview?: string };
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
  const previewSlug = rows.find((r) => r.slug === searchParams.preview)?.slug ?? rows[0]?.slug;
  return (
    <div className="space-y-6">
      <h1 className="text-[40px] leading-none md:text-[48px]">Listings</h1>
      <nav className="flex flex-wrap gap-2" aria-label="Listing status">
        {['pending', 'approved', 'rejected', 'draft', 'archived'].map((s) => (
          <Link
            key={s}
            href={`/admin/listings?status=${s}`}
            className={`inline-flex min-h-[44px] items-center px-4 text-[11px] uppercase capitalize tracking-label ${status === s ? 'glass-dark' : 'border border-line-strong'}`}
          >
            {s}
          </Link>
        ))}
      </nav>
      {rows.length === 0 && <p className="text-sm text-muted">Nothing here.</p>}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-6 xl:grid-cols-[minmax(0,1fr)_430px]">
        <ul className="space-y-3" role="list">
          {rows.map((p) => (
            <li
              key={p.id}
              className="card grid grid-cols-[64px_minmax(0,1fr)] gap-x-4 gap-y-3 p-4"
              data-testid="admin-listing"
            >
              <span className="relative aspect-4/5 w-16 shrink-0 overflow-hidden bg-stone-light">
                {p.imageUrl && (
                  <Image src={p.imageUrl} alt="" fill sizes="64px" className="object-cover" />
                )}
              </span>
              <div className="min-w-0 text-sm">
                <p className="font-medium">
                  {p.title}{' '}
                  {p.isFeatured && (
                    <span className="ml-1 rounded border border-line-strong px-1.5 text-[10px] uppercase tracking-label">
                      Featured
                    </span>
                  )}
                </p>
                <p className="text-muted">
                  {p.makerName} ({p.makerStatus}) · {formatPrice(p.priceCents)} · {p.imageCount}{' '}
                  photos{p.leadTimeDays ? ` · ${p.leadTimeDays}d lead time` : ''}
                </p>
                <div className="mt-2 flex flex-wrap gap-2 whitespace-nowrap">
                  <ProductBadgePill badge={p.productType} outlined />
                  <StatusPill status={p.status} />
                </div>
              </div>
              <div className="col-span-2 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                <Link
                  href={`/admin/listings?status=${status}&preview=${p.slug}`}
                  aria-current={previewSlug === p.slug ? 'true' : undefined}
                  className="hidden text-[11px] uppercase tracking-label underline underline-offset-4 aria-[current]:font-medium lg:inline"
                >
                  Preview here
                </Link>
                <Link
                  href={`/products/${p.slug}`}
                  className="text-[11px] uppercase tracking-label underline underline-offset-4"
                >
                  {p.status === 'approved' ? 'View' : 'Open'}
                </Link>
                {p.status !== 'approved' && (
                  <form action={listingStatusAction}>
                    <input type="hidden" name="productId" value={p.id} />
                    <input type="hidden" name="status" value="approved" />
                    <button className="glass-dark min-h-[44px] px-4 text-[10px] uppercase tracking-label">
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
                    <button className="min-h-[44px] border border-error px-4 text-[10px] uppercase tracking-label text-error">
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
                      <button className="min-h-[44px] border border-line-strong px-4 text-[10px] uppercase tracking-label">
                        {p.isFeatured ? 'Unfeature' : 'Feature'}
                      </button>
                    </form>
                  </>
                )}
                {p.status !== 'archived' && (
                  <form action={listingStatusAction}>
                    <input type="hidden" name="productId" value={p.id} />
                    <input type="hidden" name="status" value="archived" />
                    <button className="min-h-[44px] border border-line-strong px-4 text-[10px] uppercase tracking-label text-muted-2">
                      Archive
                    </button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
        {previewSlug && (
          <aside
            aria-label="Listing preview"
            className="sticky top-[88px] hidden h-[calc(100vh-112px)] self-start border border-line bg-surface lg:block"
          >
            <iframe
              key={previewSlug}
              src={`/products/${previewSlug}`}
              title="Shopper view of the selected listing"
              className="h-full w-full"
            />
          </aside>
        )}
      </div>
    </div>
  );
}
