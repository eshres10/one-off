'use client';

/** On/off switch: role="switch" with aria-checked. Toggles are one of the round shapes. */
export function Switch({
  checked,
  onChange,
  label,
  labelledBy,
  disabled = false,
  testId,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  labelledBy?: string;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      data-testid={testId}
      className="group inline-flex min-h-[44px] min-w-[52px] shrink-0 items-center justify-center disabled:opacity-40"
    >
      <span
        aria-hidden
        className={`relative inline-block h-[26px] w-[46px] rounded-circle border transition-colors ${checked ? 'border-ink bg-ink' : 'border-line-strong bg-stone'}`}
      >
        <span
          className={`absolute top-[2px] h-5 w-5 rounded-circle transition-[left] ${checked ? 'left-[22px] bg-ground' : 'left-[2px] bg-surface shadow-[0_1px_2px_rgba(17,17,17,0.2)]'}`}
        />
      </span>
    </button>
  );
}
