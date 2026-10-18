import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireSeller } from '@/lib/auth/session';
import { getSellerMaker, getSellerOrders } from '@/lib/queries/seller';
import { BRAND } from '@/lib/brand';
import { PrintButton } from './PrintButton';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Packing slip', robots: { index: false } };

export default async function PackingSlip({ params }: { params: { id: string } }) {
  const seller = await requireSeller();
  if (!z.string().uuid().safeParse(params.id).success) notFound();
  const [[o], maker] = await Promise.all([
    getSellerOrders(seller, params.id),
    getSellerMaker(seller),
  ]);
  if (!o) notFound();
  const a = o.shippingAddress;
  return (
    <main className="mx-auto max-w-2xl bg-white p-10 text-ink print:p-0">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-display text-2xl">{maker.displayName}</p>
          <p className="text-sm text-ink-muted">via {BRAND.name}</p>
        </div>
        <div className="text-right text-sm">
          <p className="font-medium">Packing slip</p>
          <p>Order {o.orderNumber}</p>
          <p>{new Date(o.createdAt).toLocaleDateString('en-AU', { dateStyle: 'medium' })}</p>
        </div>
      </div>
      <section className="mt-8 text-sm">
        <p className="font-medium">Ship to</p>
        {a && (
          <address className="not-italic">
            {[
              a.name,
              a.line1,
              a.line2,
              `${a.city ?? ''} ${a.state ?? ''} ${a.postal_code ?? ''}`,
              'Australia',
            ]
              .filter(Boolean)
              .map((l) => (
                <span key={l} className="block">
                  {l}
                </span>
              ))}
          </address>
        )}
      </section>
      <table className="mt-8 w-full text-left text-sm">
        <thead className="border-b">
          <tr>
            <th className="py-2">Item</th>
            <th className="py-2">Size / colour</th>
            <th className="py-2 text-right">Qty</th>
          </tr>
        </thead>
        <tbody>
          {o.items
            .filter((i) => i.fulfilmentStatus !== 'refunded')
            .map((i) => (
              <tr key={i.id} className="border-b">
                <td className="py-2">{i.productTitle}</td>
                <td className="py-2">{i.variantLabel}</td>
                <td className="py-2 text-right">{i.quantity}</td>
              </tr>
            ))}
        </tbody>
      </table>
      <p className="mt-8 text-sm">
        Thank you for supporting independent Australian making. Questions? Message{' '}
        {maker.displayName} from your {BRAND.name} account.
      </p>
      <p className="mt-2 text-xs text-ink-muted">Returns: {maker.returnPolicy}</p>
      <PrintButton />
    </main>
  );
}
