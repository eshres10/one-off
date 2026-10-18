export function Stars({
  rating,
  count,
  size = 12,
}: {
  rating: number;
  count?: number;
  size?: number;
}) {
  const rounded = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-1 text-ink" style={{ fontSize: size }}>
      <span aria-hidden className="tracking-[0.12em]">
        {'★★★★★'.slice(0, rounded)}
        <span className="text-disabled">{'★★★★★'.slice(rounded)}</span>
      </span>
      <span className="sr-only">Rated {rating.toFixed(1)} out of 5</span>
      {count !== undefined && <span className="text-muted-2">({count})</span>}
    </span>
  );
}
