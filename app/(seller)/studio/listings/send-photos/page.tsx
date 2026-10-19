import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireSeller } from '@/lib/auth/session';
import { firstOrderChecklist } from '@/lib/services/studio-states';
import { SendPhotosForm } from '@/components/studio/states/SendPhotosForm';

export const metadata = { title: 'Send us photos · Studio', robots: { index: false } };

/** Founding and invited makers can send photos and have One Off list the piece. */
export default async function SendPhotosPage() {
  const seller = await requireSeller();
  const list = await firstOrderChecklist(seller.makerId!);
  if (!list.canSendPhotos) redirect('/studio/listings/new');
  return (
    <div className="max-w-xl">
      <Link href="/studio/listings" className="text-[12px] uppercase tracking-label text-muted">
        ‹ Listings
      </Link>
      <h1 className="mt-4 text-[40px] leading-none md:text-[48px]">Send us photos</h1>
      <p className="mt-3 text-[14px] text-muted">
        Up to 12 photos and a few words about the piece. We’ll write the listing and put it live,
        usually within two business days, and let you know.
      </p>
      <div className="mt-8">
        <SendPhotosForm />
      </div>
    </div>
  );
}
