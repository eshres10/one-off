import { requireSeller } from '@/lib/auth/session';
import { ListingForm } from '@/components/seller/ListingForm';

export const metadata = { title: 'New listing' };

export default async function NewListingPage() {
  const seller = await requireSeller();
  return (
    <div className="max-w-3xl">
      <h1 className="mb-6 text-3xl">New listing</h1>
      <ListingForm canSubmit={seller.makerStatus === 'approved'} />
    </div>
  );
}
