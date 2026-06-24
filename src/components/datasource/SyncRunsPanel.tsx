import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, RotateCcw } from 'lucide-react';
import { listSyncRunsCloud, listSyncRunsLocal, statusBadgeColor, type SyncRunRecord } from '../../services/syncRunStore';
import { scoreLabelColor } from '../../services/syncInsights';
import { restoreUploadVersion } from '../../services/cloud/uploadPersistence';
import { executeRestoreTransaction } from '../../services/restoreTransactionManager';
import { useAuth } from '../../context/AuthContext';
import { recordTelemetry } from '../../services/telemetryService';
import { useUploadedExcel } from '../../context/UploadedExcelContext';
import { BRAND } from '../../types/adminTypes';

interface SyncRunsPanelProps {
  onRestored?: () => void;
}

export default function SyncRunsPanel({ onRestored }: SyncRunsPanelProps) {
  const { session, organization, user } = useAuth();
  const { loadFromParsed } = useUploadedExcel();
  const [runs, setRuns] = useState<SyncRunRecord[]>(() => listSyncRunsLocal());
  const [restoring, setRestoring] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const rows = await listSyncRunsCloud(organization?.id, session?.access_token);
    setRuns(rows);
  }, [organization?.id, session?.access_token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleRestore = async (run: SyncRunRecord) => {
    if (!run.uploadVersionId) {
      setMessage('No stored version available for this sync run.');
      return;
    }
    setRestoring(run.uploadVersionId);
    setMessage(null);
    const t0 = performance.now();
    const result = await executeRestoreTransaction({
      versionId: run.uploadVersionId,
      restoredBy: user?.id,
      fileName: run.workbookFilename ?? undefined,
      fetchPayload: async () => {
        const restored = await restoreUploadVersion(run.uploadVersionId!, session?.access_token);
        return restored.ok && restored.payload ? restored.payload : null;
      },
      loadFn: loadFromParsed,
    });
    recordTelemetry('restore_attempt', {
      durationMs: Math.round(performance.now() - t0),
      success: result.ok,
      metadata: { versionId: run.uploadVersionId },
    });
    setRestoring(null);
    if (!result.ok || !result.payload) {
      setMessage(result.error ?? 'Restore failed');
      if (result.rolledBack) {
        setMessage(`${result.error ?? 'Restore failed'} — previous dashboard preserved.`);
      }
      return;
    }
    setMessage(`Restored version from ${new Date(run.startedAt).toLocaleString()}`);
    onRestored?.();
  };

  const latest = runs[0];

  return (
    <div style={{ background: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>Sync Runs</div>
        <button
          type="button"
          onClick={() => void refresh()}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: BRAND.navy, display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {latest && (
        <div style={{ background: BRAND.bg, borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <strong>Latest sync</strong>
            <span style={{ color: statusBadgeColor(latest.status), fontWeight: 700, textTransform: 'capitalize' }}>{latest.status}</span>
          </div>
          <div style={{ color: BRAND.textLight, marginTop: 6 }}>
            {latest.workbookFilename ?? 'Workbook'} · {latest.rowsProcessed.toLocaleString()} rows
            {latest.durationMs != null ? ` · ${latest.durationMs}ms` : ''}
          </div>
          {latest.healthScore && (
            <div style={{ marginTop: 4, color: scoreLabelColor(latest.healthScore), fontWeight: 600 }}>
              Health: {latest.healthScore}
            </div>
          )}
          {latest.schemaChanged && (
            <div style={{ marginTop: 4, color: '#d97706' }}>Schema changed</div>
          )}
          {latest.insights[0] && (
            <div style={{ marginTop: 6, fontSize: 12 }}>{latest.insights[0]}</div>
          )}
        </div>
      )}

      {message && (
        <div style={{ fontSize: 12, color: BRAND.green, marginBottom: 10 }}>{message}</div>
      )}

      {runs.length === 0 ? (
        <div style={{ fontSize: 13, color: BRAND.textLight }}>No sync runs yet. Use Sync Now on the OneDrive tab.</div>
      ) : (
        <div style={{ maxHeight: 360, overflowY: 'auto', display: 'grid', gap: 8 }}>
          {runs.map(run => (
            <div key={run.id} style={{ border: `1px solid ${BRAND.border}`, borderRadius: 8, padding: 10, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontWeight: 600 }}>{run.workbookFilename ?? run.source}</span>
                <span style={{ color: statusBadgeColor(run.status), textTransform: 'capitalize' }}>{run.status}</span>
              </div>
              <div style={{ color: BRAND.textLight, marginTop: 4 }}>
                {new Date(run.startedAt).toLocaleString()} · {run.rowsProcessed} rows
                {run.warningCount ? ` · ${run.warningCount} warnings` : ''}
              </div>
              {run.insights[0] && <div style={{ marginTop: 4 }}>{run.insights[0]}</div>}
              {run.uploadVersionId && run.status !== 'failed' && (
                <button
                  type="button"
                  disabled={restoring === run.uploadVersionId}
                  onClick={() => void handleRestore(run)}
                  style={{
                    marginTop: 8,
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: `1px solid ${BRAND.border}`,
                    background: '#fff',
                    cursor: 'pointer',
                    fontSize: 11,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <RotateCcw size={12} />
                  {restoring === run.uploadVersionId ? 'Restoring…' : 'Restore This Version'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
