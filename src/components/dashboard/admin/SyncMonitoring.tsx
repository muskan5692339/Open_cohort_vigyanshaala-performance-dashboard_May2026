import { useEffect } from 'react';
import { RefreshCw, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { BRAND } from '../../../types/adminTypes';
import { useOneDriveSync } from '../../../hooks/useOneDriveSync';
import type { SyncLog } from '../../../types/syncTypes';

type StatusKind = SyncLog['status'];

const STATUS_META: Record<StatusKind, { bg: string; color: string }> = {
  success: { bg: BRAND.greenLight,  color: BRAND.greenDark  },
  partial: { bg: BRAND.yellowLight, color: BRAND.yellowDark },
  error:   { bg: BRAND.redLight,    color: BRAND.red        },
  running: { bg: '#eff6ff',         color: '#2563eb'        },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status as StatusKind] ?? STATUS_META.error;
  const Icon = status === 'success' ? CheckCircle2 : status === 'partial' ? AlertTriangle : XCircle;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, background: meta.bg, color: meta.color, fontWeight: 700, fontSize: 11 }}>
      <Icon size={12} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export default function SyncMonitoring() {
  const { state, triggerSync, refreshLogs, reset } = useOneDriveSync();

  useEffect(() => { refreshLogs(); }, [refreshLogs]);

  const logs = state.logs;
  const successCount = logs.filter(l => l.status === 'success').length;
  const partialCount = logs.filter(l => l.status === 'partial').length;
  const failedCount  = logs.filter(l => l.status === 'error').length;
  const successRate  = logs.length > 0 ? Math.round((successCount / logs.length) * 100) : 0;
  const lastLog      = logs[0];

  const result = state.result;

  return (
    <div style={{ display: 'grid', gap: 16 }}>

      {/* Actions card */}
      <div style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: BRAND.text, marginBottom: 14 }}>Sync Actions</div>

        {/* Error */}
        {state.error && (
          <div style={{ background: BRAND.redLight, border: `1px solid #fca5a5`, borderRadius: 8, padding: '10px 14px', color: BRAND.red, fontSize: 13, marginBottom: 14 }}>
            <strong>Error: </strong>{state.error}
            <button onClick={reset} style={{ marginLeft: 12, fontSize: 12, background: 'none', border: 'none', color: BRAND.red, cursor: 'pointer', textDecoration: 'underline' }}>Dismiss</button>
          </div>
        )}

        {/* Success result */}
        {result && !state.isRunning && (
          <div style={{ background: result.status === 'success' ? BRAND.greenLight : BRAND.yellowLight, border: `1px solid ${result.status === 'success' ? '#86efac' : '#fde68a'}`, borderRadius: 8, padding: '10px 14px', color: result.status === 'success' ? BRAND.greenDark : BRAND.yellowDark, fontSize: 13, marginBottom: 14 }}>
            <strong>{result.status === 'success' ? 'Sync complete' : 'Sync partial'}:</strong>
            {' '}{result.totalInserted} inserted · {result.totalUpdated} updated · {result.totalFailed} failed · {Math.round(result.durationMs / 1000)}s
            {result.errors.length > 0 && (
              <details style={{ marginTop: 6 }}>
                <summary style={{ cursor: 'pointer', fontSize: 12 }}>{result.errors.length} error(s)</summary>
                <ul style={{ margin: '6px 0 0', paddingLeft: 20, fontSize: 12 }}>
                  {result.errors.slice(0, 10).map((e, i) => <li key={i}>{e.message}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={triggerSync}
            disabled={state.isRunning}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: BRAND.yellow, color: BRAND.navy, border: 'none', padding: '11px 20px', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: state.isRunning ? 'progress' : 'pointer', opacity: state.isRunning ? 0.7 : 1, fontFamily: 'inherit' }}
          >
            <RefreshCw size={15} style={state.isRunning ? { animation: 'vs-spin 1s linear infinite' } : undefined} />
            {state.isRunning ? 'Syncing…' : 'Sync Now from OneDrive'}
          </button>

          <button
            onClick={refreshLogs}
            disabled={state.isRunning}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', color: BRAND.textLight, border: `1px solid ${BRAND.border}`, padding: '11px 14px', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <RefreshCw size={13} /> Refresh logs
          </button>

          {state.isRunning && (
            <span style={{ fontSize: 13, color: BRAND.textLight, fontStyle: 'italic' }}>
              Talking to OneDrive and Supabase — this may take up to 60 s…
            </span>
          )}
        </div>

        <p style={{ fontSize: 12, color: BRAND.textLight, marginTop: 14, marginBottom: 0 }}>
          The sync runs automatically every Monday at 07:30 IST. You can also trigger it manually above.
          Configure the OneDrive File ID and sheet names in <strong>Settings</strong>.
        </p>
      </div>

      {/* Last sync */}
      {lastLog && (
        <div style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 12, color: BRAND.textLight, fontWeight: 600, marginBottom: 4 }}>Last Sync</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: BRAND.text, display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            {new Date(lastLog.run_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
            <StatusBadge status={lastLog.status} />
          </div>
          <div style={{ display: 'flex', gap: 20, fontSize: 12, color: BRAND.textLight }}>
            <span><strong style={{ color: BRAND.text }}>{lastLog.records_updated}</strong> records updated</span>
            <span><strong style={{ color: (lastLog.errors as unknown[])?.length > 0 ? BRAND.red : BRAND.text }}>
              {Array.isArray(lastLog.errors)
                ? lastLog.errors.length
                : typeof lastLog.errors === 'string'
                  ? JSON.parse(lastLog.errors).length
                  : 0}
            </strong> errors</span>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        {[
          { label: 'Total Syncs',  value: logs.length,    color: BRAND.text      },
          { label: 'Success Rate', value: `${successRate}%`, color: BRAND.greenDark },
          { label: 'Successful',   value: successCount,   color: BRAND.green     },
          { label: 'Partial',      value: partialCount,   color: BRAND.yellowDark},
          { label: 'Failed',       value: failedCount,    color: BRAND.red       },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 11, color: BRAND.textLight, fontWeight: 600, textTransform: 'uppercase' }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color, marginTop: 4 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* History table */}
      <div style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${BRAND.border}` }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: BRAND.text }}>Sync History</div>
          <div style={{ fontSize: 12, color: BRAND.textLight, marginTop: 2 }}>
            {logs.length > 0 ? `Last ${logs.length} runs from Supabase sync_logs` : 'No syncs yet — click "Sync Now" above.'}
          </div>
        </div>
        {logs.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ background: BRAND.bg }}>
                <tr>
                  {['Timestamp', 'Status', 'Records Updated', 'Errors'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, color: BRAND.textLight, fontWeight: 700, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => {
                  const errCount = Array.isArray(log.errors)
                    ? log.errors.length
                    : typeof log.errors === 'string'
                      ? (() => { try { return JSON.parse(log.errors as unknown as string).length; } catch { return 0; } })()
                      : 0;
                  return (
                    <tr key={log.id ?? i} style={{ borderBottom: `1px solid ${BRAND.borderLight}` }}>
                      <td style={{ padding: '10px 14px', color: BRAND.text }}>{new Date(log.run_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td style={{ padding: '10px 14px' }}><StatusBadge status={log.status} /></td>
                      <td style={{ padding: '10px 14px', color: BRAND.text }}>{log.records_updated}</td>
                      <td style={{ padding: '10px 14px', color: errCount > 0 ? BRAND.red : BRAND.textLight }}>{errCount}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`@keyframes vs-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
