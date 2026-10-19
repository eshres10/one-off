import { notFound } from 'next/navigation';
import { z } from 'zod';
import { getEditorShop, getPriceHints } from '@/lib/queries/editor';
import { newPiece } from '@/lib/studio/pieces';
import { PieceEditor } from '@/components/studio/editor/PieceEditor';

export const metadata = { title: 'Add a piece' };

export default async function AdminNewPiece({ params }: { params: { id: string } }) {
  if (!z.string().uuid().safeParse(params.id).success) notFound();
  const [shop, hints] = await Promise.all([getEditorShop(params.id), getPriceHints()]);
  if (!shop) notFound();
  return (
    <PieceEditor
      initial={{ ...newPiece(shop), listedByAdmin: true }}
      shop={shop}
      priceHints={hints}
      mode="admin"
      backHref={`/admin/shops/${params.id}`}
    />
  );
}
