import { notFound } from 'next/navigation';
import { requireSeller } from '@/lib/auth/session';
import { getEditorShop } from '@/lib/queries/editor';
import { DesktopRedirect } from '@/components/app/DesktopRedirect';
import { NewPiece } from '@/components/app/studio/NewPiece';

export const metadata = { title: 'List a piece · Studio' };

/** The phone's two-step "List a piece"; a desktop browser gets the full editor. */
export default async function StudioNewPage() {
  const seller = await requireSeller();
  const shop = await getEditorShop(seller.makerId);
  if (!shop) notFound();
  return (
    <>
      <DesktopRedirect to="/studio/listings/new" />
      <div className="md:hidden">
        <NewPiece shop={shop} />
      </div>
    </>
  );
}
