/** When the admin last uploaded / re-published the cohort workbook. */
export function formatAdminUpdateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export function adminDataUpdatedAt(meta: {
  publishedAt?: string;
  loadedAt?: string;
} | null | undefined): string | null {
  if (!meta) return null;
  return meta.publishedAt ?? meta.loadedAt ?? null;
}
