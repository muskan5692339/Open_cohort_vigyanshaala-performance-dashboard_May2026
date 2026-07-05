import './RosterSyncStatus.css';
import { formatAdminUpdateTime } from '../../utils/formatAdminUpdateTime';

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
  /** Hide "loaded on this device" — students only need admin upload time. */
  adminTimeOnly?: boolean;
}

function formatWhen(iso: string | null): string {
  return formatAdminUpdateTime(iso);
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
  adminTimeOnly = true,
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
          <strong>Dashboard data last updated by admin.</strong>
        )}
        <span>
          Source file uploaded {formatWhen(publishedAt)}
          {!adminTimeOnly && fetchedAt ? ` · Loaded on this device ${formatWhen(fetchedAt)}` : ''}
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
