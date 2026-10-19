import { requireUser } from '@/lib/auth/session';
import { listAddresses, listSavedCards } from '@/lib/services/buyer-profile';
import { removeCardAction } from '@/lib/actions/account';
import { AddressCards } from '@/components/account/AddressCards';

export const metadata = { title: 'Addresses & payment' };

const BRAND: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
};

export default async function AddressesPage() {
  const user = await requireUser('/account/addresses');
  const [addresses, cards] = await Promise.all([listAddresses(user), listSavedCards(user)]);
  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-[40px] leading-none md:text-[44px]">
        Addresses &amp; payment
      </h1>

      <section className="mt-8" aria-labelledby="addresses-h">
        <h2 id="addresses-h" className="text-[11px] uppercase tracking-label">
          Addresses
        </h2>
        <div className="mt-3">
          <AddressCards addresses={addresses} />
        </div>
      </section>

      <section className="mt-12" aria-labelledby="cards-h">
        <h2 id="cards-h" className="text-[11px] uppercase tracking-label">
          Saved cards
        </h2>
        {cards.length === 0 ? (
          <p className="mt-3 text-[14px] text-muted" data-testid="no-cards">
            No saved cards. Tick “Save my details” at checkout to keep a card for next time.
          </p>
        ) : (
          <ul className="mt-3 border-t border-line" role="list">
            {cards.map((c) => (
              <li
                key={c.id}
                className="flex min-h-[60px] items-center justify-between gap-3 border-b border-line"
                data-testid="saved-card"
              >
                <span className="text-[14px]">
                  {BRAND[c.brand] ?? c.brand.charAt(0).toUpperCase() + c.brand.slice(1)} ending{' '}
                  {c.last4}
                  <span className="ml-2 text-[12px] text-muted">
                    Expires {String(c.expMonth).padStart(2, '0')}/{String(c.expYear).slice(-2)}
                  </span>
                </span>
                <form action={removeCardAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <button className="min-h-[44px] text-[12px] underline underline-offset-[3px]">
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-[13px] text-muted">
          Card details are stored securely by Stripe. One Off never sees your full card number.
        </p>
      </section>
    </div>
  );
}
