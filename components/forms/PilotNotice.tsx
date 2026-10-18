/** Three-step explainer for the concierge commission pilot. */
export function PilotNotice({ step = 1 }: { step?: 1 | 2 | 3 }) {
  const steps = ['Send brief', 'Get a quote', 'Accept & pay'];
  return (
    <div>
      <ol className="grid grid-cols-3 gap-px" aria-label="How custom requests work">
        {steps.map((s, i) => (
          <li
            key={s}
            aria-current={i + 1 === step ? 'step' : undefined}
            className={`flex min-h-[40px] items-center justify-center px-2 text-center text-[11px] ${i + 1 === step ? 'bg-ink text-ground' : 'bg-stone-light text-text2'}`}
          >
            {i + 1} · {s}
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[11px] uppercase tracking-label text-muted-2">
        Concierge pilot · payment by secure Stripe link, never directly to the maker
      </p>
    </div>
  );
}
