import { ShippingOfferForm } from '@/components/admin/ShippingOfferForm';
import { formatPrice } from '@/lib/domain/money';
import { getShippingOffer, subsidySpentThisMonth } from '@/lib/shipping/settings';

export const metadata = { title: 'Shipping offer' };
export const dynamic = 'force-dynamic';

export default async function ShippingOfferPage() {
  const [offer, spent] = await Promise.all([getShippingOffer(), subsidySpentThisMonth()]);
  const paused =
    offer.enabled && offer.monthlyBudgetCents !== null && spent >= offer.monthlyBudgetCents;
  return (
    <div>
      <h1 className="text-[40px] leading-none md:text-[48px]">Shipping offer</h1>
      <p className="mb-6 mt-2 max-w-xl text-sm text-ink-muted">
        Each maker ships from their own studio at their own rate. This offer caps what buyers pay
        for standard shipping across makers, and can make it free over a bag total.
      </p>
      <dl className="mb-8 grid max-w-xl grid-cols-2 gap-4 border border-line p-4 text-[14px]">
        <div>
          <dt className="text-[12px] text-muted">Covered this month</dt>
          <dd className="font-display text-[26px] leading-none" data-testid="ship-spent">
            {formatPrice(spent)}
          </dd>
        </div>
        <div>
          <dt className="text-[12px] text-muted">Budget</dt>
          <dd className="font-display text-[26px] leading-none">
            {offer.monthlyBudgetCents === null ? 'No limit' : formatPrice(offer.monthlyBudgetCents)}
          </dd>
        </div>
        {paused && (
          <p className="col-span-2 bg-stone p-3 text-[13px]" role="status">
            The budget is used up, so the offer is paused until the 1st. Raise the budget to turn it
            back on now.
          </p>
        )}
      </dl>
      <ShippingOfferForm offer={offer} />
    </div>
  );
}
