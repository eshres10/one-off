import { SunIcon } from '@/components/states/HolidaySun';

/** "On holiday until 12 Jan. You can still order. …" in a stone box. */
export function HolidayBanner({ message, note }: { message: string; note?: string | null }) {
  return (
    <div
      className="flex gap-3 bg-stone px-4 py-3 text-[13px] leading-relaxed"
      role="status"
      data-testid="holiday-banner"
    >
      <SunIcon />
      <p>
        {message}
        {note ? <span className="mt-1 block text-muted">“{note}”</span> : null}
      </p>
    </div>
  );
}
