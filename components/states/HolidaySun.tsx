/** A small line sun for the holiday banner. */
export function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={20}
      height={20}
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth={1}
      className="mt-0.5 shrink-0"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
    </svg>
  );
}
