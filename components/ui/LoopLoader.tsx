import { Monogram } from './Monogram';

/**
 * The Loop loader: the OO monogram on ground, with a thin line looping beneath it. Reduced motion
 * shows it still.
 */
export function LoopLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div
      className="fixed inset-0 z-[95] flex flex-col items-center justify-center bg-ground"
      role="status"
      aria-label={label}
      data-testid="loop-loader"
    >
      <Monogram className="loop-mark h-20 w-20 text-ink" />
      <span aria-hidden className="mt-8 block h-px w-24 overflow-hidden bg-line">
        <span className="loop-line block h-full w-1/3 bg-ink" />
      </span>
    </div>
  );
}
