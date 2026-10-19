import { notFound } from 'next/navigation';
import { requireSeller } from '@/lib/auth/session';
import { getEditorShop, getPriceHints } from '@/lib/queries/editor';
import { newPiece } from '@/lib/studio/pieces';
import { PieceEditor } from '@/components/studio/editor/PieceEditor';

export const metadata = { title: 'Add a piece · Studio' };

export default async function NewPiecePage() {
  const seller = await requireSeller();
  const [shop, hints] = await Promise.all([getEditorShop(seller.makerId), getPriceHints()]);
  if (!shop) notFound();
  return <PieceEditor initial={newPiece(shop)} shop={shop} priceHints={hints} />;
}
