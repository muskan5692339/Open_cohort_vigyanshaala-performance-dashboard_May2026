import './RosterSyncStatus.css';

interface Props {
  publishedAt: string | null;
  fetchedAt: string | null;
  loading: boolean;
  refreshing: boolean;
  isStale: boolean;
  incomplete: boolean;
  studentCount: number;
  onRefresh: () => void;
  compact?: boolean;
}

function formatWhen(iso: string | null): string {
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

export default function RosterSyncStatus({
  publishedAt,
  fetchedAt,
  loading,
  refreshing,
  isStale,
  incomplete,
  studentCount,
  onRefresh,
  compact = false,
}: Props) {
  if (loading && studentCount === 0) {
    return (
      <div className={`roster-sync roster-sync--loading ${compact ? 'roster-sync--compact' : ''}`}>
        <span className="roster-sync__spinner" aria-hidden="true" />
        Loading latest cohort data…
      </div>
    );
  }

  return (
    <div
      className={`roster-sync ${isStale || incomplete ? 'roster-sync--warn' : 'roster-sync--ok'} ${compact ? 'roster-sync--compact' : ''}`}
      role="status"
    >
      <div className="roster-sync__text">
        {isStale ? (
          <strong>Showing saved copy on this phone — may be outdated.</strong>
        ) : incomplete ? (
          <strong>Some attendance details may be missing.</strong>
        ) : (
          <strong>Data loaded from server.</strong>
        )}
        <span>
          Published {formatWhen(publishedAt)}
          {fetchedAt ? ` · Loaded on this device ${formatWhen(fetchedAt)}` : ''}
        </span>
        {(isStale || incomplete) && (
          <span className="roster-sync__hint">
            Numbers look wrong (e.g. attendance %)? Tap refresh below — you do not need to clear browser cache.
          </span>
        )}
      </div>
      <button
        type="button"
        className="roster-sync__btn"
        onClick={onRefresh}
        disabled={refreshing || loading}
      >
        {refreshing ? 'Refreshing…' : 'Refresh latest data'}
      </button>
    </div>
  );
}
