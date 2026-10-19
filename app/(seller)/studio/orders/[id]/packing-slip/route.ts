import { NextResponse } from 'next/server';
import { requireSeller } from '@/lib/auth/session';
import { sql } from '@/lib/db';
import { getStudioOrder } from '@/lib/services/studio-orders';
import { packingSlipPdf } from '@/lib/studio/packing-slip';

export const dynamic = 'force-dynamic';

/** A5 packing slip PDF for the maker's own order. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const seller = await requireSeller();
  if (!/^[0-9a-f-]{36}$/.test(params.id)) return new NextResponse(null, { status: 404 });
  const order = await getStudioOrder(seller, params.id);
  if (!order) return new NextResponse(null, { status: 404 });
  const [shop] = await sql()<{ displayName: string; city: string | null }[]>`
    select display_name, city from public.makers where id = ${seller.makerId}`;
  const bytes = await packingSlipPdf(order, shop!);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="packing-slip-${order.orderNumber}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
