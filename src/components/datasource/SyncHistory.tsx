import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { RefreshCw, CheckCircle, XCircle, AlertCircle, Clock } from 'lucide-react';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
);

interface SyncLogRow {
  id: string;
  status: 'success' | 'partial' | 'error' | 'running';
  records_updated: number;
  errors: string | null;
  run_at: string;
}

function StatusBadge({ status }: { status: SyncLogRow['status'] }) {
  const map = {
    success: { color: '#15803d', bg: '#f0fdf4', border: '#86efac', icon: <CheckCircle size={13} />, label: 'Success' },
    partial: { color: '#92400e', bg: '#fffbeb', border: '#fde68a', icon: <AlertCircle size={13} />, label: 'Partial' },
    error:   { color: '#dc2626', bg: '#fef2f2', border: '#fca5a5', icon: <XCircle size={13} />,    label: 'Error'   },
    running: { color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe', icon: <Clock size={13} />,      label: 'Running' },
  }[status] ?? { color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb', icon: null, label: status };

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600,
      color: map.color, background: map.bg, border: `1px solid ${map.border}`,
    }}>
      {map.icon}{map.label}
    </span>
  );
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  } catch { return iso; }
}

function parseErrors(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { message: string }[];
    if (Array.isArray(parsed)) return parsed.map(e => e.message ?? String(e));
  } catch { /* fall through */ }
  return [raw];
}

export default function SyncHistory() {
  const [logs, setLogs]         = useState<SyncLogRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('sync_logs')
        .select('id, status, records_updated, errors, run_at')
        .order('run_at', { ascending: false })
        .limit(50);
      if (err) throw err;
      setLogs((data ?? []) as SyncLogRow[]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchLogs(); }, [fetchLogs]);

  return (
    <div style={{ padding: '32px 40px', maxWidth: 900, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1e2d45', margin: '0 0 6px' }}>Sync History</h1>
          <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>Last 50 sync runs — from OneDrive sync and Excel uploads.</p>
        </div>
        <button
          onClick={() => void fetchLogs()}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '9px 18px', borderRadius: 8, border: '1px solid #e5e7eb',
            background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            opacity: loading ? 0.7 : 1,
          }}
        >
          <RefreshCw size={14} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
          Refresh
        </button>
      </div>

      {error && (
        <div style={{ padding: '14px 16px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, color: '#dc2626', fontSize: 13, marginBottom: 20 }}>
          <strong>Could not load sync logs:</strong> {error}
          {error.includes('relation') && <span> — the <code>sync_logs</code> table may not exist yet. Run a sync first.</span>}
        </div>
      )}

      {!error && !loading && logs.length === 0 && (
        <div style={{ padding: '48px 0', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
          <Clock size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
          <div>No sync history yet.</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Use <strong>OneDrive Sync</strong> or <strong>Excel Upload</strong> to import data.</div>
        </div>
      )}

      {logs.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, overflow: 'hidden' }}>
          {/* Header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 120px 130px 80px 80px',
            padding: '12px 20px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb',
            fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5,
          }}>
            <span>Date &amp; Time</span>
            <span>Status</span>
            <span>Records Updated</span>
            <span>Errors</span>
            <span></span>
          </div>

          {logs.map((log, idx) => {
            const errs = parseErrors(log.errors);
            const isExpanded = expanded === log.id;
            return (
              <div key={log.id ?? idx} style={{ borderBottom: idx < logs.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 120px 130px 80px 80px',
                  padding: '14px 20px', alignItems: 'center',
                  background: isExpanded ? '#fafafa' : '#fff',
                }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{formatDate(log.run_at)}</div>
                  </div>
                  <StatusBadge status={log.status} />
                  <div style={{ fontSize: 14, color: '#374151', fontWeight: 500 }}>
                    {(log.records_updated ?? 0).toLocaleString()}
                  </div>
                  <div style={{ fontSize: 14, color: errs.length > 0 ? '#dc2626' : '#9ca3af', fontWeight: errs.length > 0 ? 600 : 400 }}>
                    {errs.length > 0 ? errs.length : '—'}
                  </div>
                  <div>
                    {errs.length > 0 && (
                      <button
                        onClick={() => setExpanded(isExpanded ? null : log.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#6b7280', fontFamily: 'inherit', padding: 0 }}
                      >
                        {isExpanded ? 'Hide' : 'View'}
                      </button>
                    )}
                  </div>
                </div>

                {isExpanded && errs.length > 0 && (
                  <div style={{ padding: '0 20px 14px', background: '#fafafa' }}>
                    <div style={{ background: '#fff', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', maxHeight: 160, overflowY: 'auto' }}>
                      {errs.map((msg, i) => (
                        <div key={i} style={{ fontSize: 12, color: '#ef4444', padding: '3px 0', borderBottom: i < errs.length - 1 ? '1px solid #fef2f2' : 'none' }}>
                          {msg}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
