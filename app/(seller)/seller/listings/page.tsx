import Link from 'next/link';
import { Img as Image } from '@/components/ui/Img';
import { requireSeller } from '@/lib/auth/session';
import { getSellerListings } from '@/lib/queries/seller';
import { listingCommandAction } from '@/lib/actions/seller';
import { formatPrice } from '@/lib/domain/money';
import { StatusPill, ProductBadgePill } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';

export const metadata = { title: 'Listings' };

export default async function ListingsPage() {
  const seller = await requireSeller();
  const listings = await getSellerListings(seller);
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <h1 className="text-3xl">Listings</h1>
        <ButtonLink href="/seller/listings/new">New listing</ButtonLink>
      </div>
      <p className="text-sm text-ink-muted">
        New listings are reviewed by our team before they appear in the shop — usually within one
        business day.
      </p>
      {listings.length === 0 ? (
        <EmptyState
          title="No listings yet"
          action={<ButtonLink href="/seller/listings/new">Create your first listing</ButtonLink>}
        />
      ) : (
        <ul
          className="divide-y divide-stone/70 rounded-2xl border border-stone/70 bg-white"
          role="list"
        >
          {listings.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-4 p-4">
              <span className="relative aspect-4/5 w-14 shrink-0 overflow-hidden rounded-md bg-stone-light">
                {l.imageUrl && (
                  <Image src={l.imageUrl} alt="" fill sizes="56px" className="object-cover" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <Link href={`/seller/listings/${l.id}`} className="font-medium hover:underline">
                  {l.title}
                </Link>
                <p className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                  {formatPrice(l.priceCents)} · {l.totalStock}{' '}
                  {l.productType === 'made_to_order' ? 'capacity' : 'in stock'} · {l.viewCount}{' '}
                  views · {l.saveCount} saves
                  <ProductBadgePill badge={l.productType} className="border border-stone/70" />
                </p>
                {l.status === 'rejected' && l.rejectionReason && (
                  <p className="mt-1 text-sm text-alert">Needs changes: {l.rejectionReason}</p>
                )}
              </div>
              <StatusPill status={l.status === 'approved' ? 'live' : l.status} />
              <div className="flex gap-2 text-sm">
                {l.status === 'approved' && (
                  <Link href={`/products/${l.slug}`} className="underline underline-offset-4">
                    View
                  </Link>
                )}
                <form action={listingCommandAction}>
                  <input type="hidden" name="productId" value={l.id} />
                  <input type="hidden" name="command" value="duplicate" />
                  <button className="underline underline-offset-4">Duplicate</button>
                </form>
                {l.status !== 'archived' && (
                  <form action={listingCommandAction}>
                    <input type="hidden" name="productId" value={l.id} />
                    <input type="hidden" name="command" value="archive" />
                    <button className="text-ink-muted underline underline-offset-4">Archive</button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
