export function PilotNotice() {
  return (
    <div className="rounded-2xl border border-clay/30 bg-clay-light p-4 text-sm text-ink-soft">
      <p className="font-medium text-clay">Custom commissions · concierge pilot</p>
      <p className="mt-1">
        This is separate from regular checkout. The maker reviews your brief and may send a quote
        (price, deposit, timing and revisions). If you accept, our team sends you a secure Stripe
        payment link for the deposit — you’ll never be asked to pay a maker directly.
      </p>
    </div>
  );
}
