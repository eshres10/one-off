import { StarIcon } from './icons';

export function Stars({
  rating,
  count,
  size = 14,
}: {
  rating: number;
  count?: number;
  size?: number;
}) {
  const rounded = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-1 text-sm text-ink-soft">
      <span className="inline-flex text-ink" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => (
          <StarIcon key={i} width={size} height={size} filled={i <= rounded} />
        ))}
      </span>
      <span className="sr-only">Rated {rating.toFixed(1)} out of 5</span>
      {count !== undefined && <span aria-hidden>({count})</span>}
    </span>
  );
}
