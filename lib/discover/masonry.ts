/**
 * Shortest-column masonry. Items keep left-to-right reading order (each goes into the column
 * that is currently shortest) and placement only depends on earlier items, so appending a page
 * never moves what's already on screen. Heights are relative to the column width.
 */
export function placeInColumns<T>(items: T[], columns: number, height: (item: T) => number): T[][] {
  const cols: T[][] = Array.from({ length: columns }, () => []);
  const heights = new Array<number>(columns).fill(0);
  for (const item of items) {
    let shortest = 0;
    for (let c = 1; c < columns; c++) if (heights[c]! < heights[shortest]! - 1e-6) shortest = c;
    cols[shortest]!.push(item);
    heights[shortest]! += height(item);
  }
  return cols;
}
