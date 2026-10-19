import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/session';
import { getEditorShop, getPriceHints } from '@/lib/queries/editor';
import { getPiece } from '@/lib/services/studio-listings';
import { PieceEditor } from '@/components/studio/editor/PieceEditor';

export const metadata = { title: 'Edit piece' };

export default async function AdminEditPiece({
  params,
}: {
  params: { id: string; pieceId: string };
}) {
  const admin = await requireAdmin();
  const uuid = z.string().uuid();
  if (!uuid.safeParse(params.id).success || !uuid.safeParse(params.pieceId).success) notFound();
  const [piece, shop, hints] = await Promise.all([
    getPiece(admin, params.pieceId),
    getEditorShop(params.id),
    getPriceHints(),
  ]);
  if (!piece || !shop) notFound();
  return (
    <PieceEditor
      key={piece.id}
      initial={piece}
      shop={shop}
      priceHints={hints}
      mode="admin"
      backHref={`/admin/shops/${params.id}`}
    />
  );
}
