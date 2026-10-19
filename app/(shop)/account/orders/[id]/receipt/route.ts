import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { getBuyerOrders } from '@/lib/queries/account';
import { receiptPdf } from '@/lib/account/receipt';

export const dynamic = 'force-dynamic';

/** The buyer's receipt as a PDF, read through RLS so only the buyer gets it. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return new NextResponse(null, { status: 401 });
  if (!/^(OO-[A-Z0-9-]{1,20}|[0-9a-f-]{36})$/i.test(params.id))
    return new NextResponse(null, { status: 404 });
  const [order] = await getBuyerOrders(user, params.id);
  if (!order) return new NextResponse(null, { status: 404 });
  const bytes = await receiptPdf(order);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="one-off-receipt-${order.orderNumber}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
