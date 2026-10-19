import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireSeller } from '@/lib/auth/session';
import { getEditorShop, getPriceHints } from '@/lib/queries/editor';
import { getPiece } from '@/lib/services/studio-listings';
import { PieceEditor } from '@/components/studio/editor/PieceEditor';

export const metadata = { title: 'Edit piece · Studio' };

export default async function EditPiecePage({ params }: { params: { id: string } }) {
  const seller = await requireSeller();
  if (!z.string().uuid().safeParse(params.id).success) notFound();
  const [piece, shop, hints] = await Promise.all([
    getPiece(seller, params.id),
    getEditorShop(seller.makerId),
    getPriceHints(),
  ]);
  if (!piece || !shop) notFound();
  return <PieceEditor key={piece.id} initial={piece} shop={shop} priceHints={hints} />;
}
