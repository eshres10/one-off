import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireSeller } from '@/lib/auth/session';
import { getListingForEdit } from '@/lib/services/listings';
import { ListingForm } from '@/components/seller/ListingForm';
import { StatusPill } from '@/components/ui/Badge';

export const metadata = { title: 'Edit listing' };

export default async function EditListingPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { saved?: string };
}) {
  const seller = await requireSeller();
  if (!z.string().uuid().safeParse(params.id).success) notFound();
  const data = await getListingForEdit(seller, params.id);
  if (!data) notFound();
  const p = data.product as Record<string, string | number | null | string[]>;
  const str = (v: unknown) => (v === null || v === undefined ? undefined : String(v));
  const activeVariants = data.variants.filter((v) => v.isActive);
  return (
    <div className="max-w-3xl">
      <Link href="/seller/listings" className="text-sm text-ink-muted hover:underline">
        ← All listings
      </Link>
      <div className="mb-6 mt-2 flex items-center justify-between gap-3">
        <h1 className="text-[40px] leading-none md:text-[48px]">{String(p.title)}</h1>
        <StatusPill status={p.status === 'approved' ? 'live' : String(p.status)} />
      </div>
      {searchParams.saved && (
        <p className="mb-4 bg-stone-light px-3 py-2.5 text-[13px]" role="status">
          Listing saved.
        </p>
      )}
      {p.status === 'rejected' && p.rejectionReason && (
        <p className="mb-4 bg-error-bg px-3 py-2.5 text-[13px] text-error">
          Our team asked for changes: {String(p.rejectionReason)}
        </p>
      )}
      <ListingForm
        canSubmit={seller.makerStatus === 'approved'}
        defaults={{
          productId: String(p.id),
          title: str(p.title),
          description: str(p.description),
          category: str(p.category),
          tags: Array.isArray(p.tags) ? p.tags.join(', ') : undefined,
          price: p.priceCents ? String(Number(p.priceCents) / 100) : undefined,
          productType: p.productType as 'ready_to_ship' | 'made_to_order' | 'one_of_one',
          sizes: Array.from(new Set(activeVariants.map((v) => v.size))),
          colours: Array.isArray(p.colours) ? p.colours.join(', ') : undefined,
          stock: String(activeVariants[0]?.stockQuantity ?? 0),
          fabricComposition: str(p.fabricComposition),
          careInstructions: str(p.careInstructions),
          countryOfMaking: str(p.countryOfMaking),
          modelHeightCm: str(p.modelHeightCm),
          modelSizeWorn: str(p.modelSizeWorn),
          leadTimeDays: str(p.leadTimeDays),
          madeToOrderOptions: str(p.madeToOrderOptions),
          shippingPolicy: str(p.shippingPolicy),
          measurements: data.measurements.map((m) => ({
            name: m.name,
            valueCm: String(m.valueCm),
          })),
          images: data.images,
          status: String(p.status),
        }}
      />
    </div>
  );
}
