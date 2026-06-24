/** Performance helpers — does not modify analytics/intelligence engines. */

export const LARGE_DATASET_ROWS = 5_000;
export const HEAVY_ANALYTICS_ROWS = 8_000;
export const ANALYTICS_DEBOUNCE_MS = 120;

export function shouldDeferAnalytics(rowCount: number): boolean {
  return rowCount >= LARGE_DATASET_ROWS;
}

export function filterSignature(selections: Record<string, string[]>): string {
  return JSON.stringify(
    Object.entries(selections)
      .filter(([, v]) => v.length)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

export function rowsReferenceEqual(a: Record<string, string>[], b: Record<string, string>[]): boolean {
  return a === b;
}

export function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
