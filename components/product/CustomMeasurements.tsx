/** Measurement fields shown when a buyer picks the "Custom" size on a made-to-order piece. */
export function CustomMeasurements() {
  const fields = [
    ['bust', 'Bust'],
    ['waist', 'Waist'],
    ['hips', 'Hips'],
    ['height', 'Height (optional)'],
  ] as const;
  return (
    <fieldset className="mt-4 border border-line p-3" data-testid="custom-measurements">
      <legend className="px-1 text-[11px] uppercase tracking-label">Your measurements (cm)</legend>
      <div className="grid grid-cols-2 gap-2">
        {fields.map(([name, label]) => (
          <label key={name} className="text-[12px] text-muted">
            {label}
            <input
              name={`measure_${name}`}
              type="number"
              inputMode="numeric"
              min={30}
              max={250}
              required={name !== 'height'}
              className="input mt-1"
            />
          </label>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted-2">
        The maker cuts to these. Measure over underwear, tape snug, not tight.
      </p>
    </fieldset>
  );
}
