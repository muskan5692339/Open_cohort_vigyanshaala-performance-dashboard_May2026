import { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle, XCircle, Loader, Link2, FileSpreadsheet, Pause, Play } from 'lucide-react';
import type { SyncConfig } from '../../types/syncTypes';
import { DEFAULT_SYNC_CONFIG, SYNC_CONFIG_KEY } from '../../types/syncTypes';
import { loadSyncConfig, saveSyncConfig } from '../../services/oneDriveSync';
import { useAuth } from '../../context/AuthContext';
import { useOneDriveOrchestrator } from '../../hooks/useOneDriveOrchestrator';
import { INTERVAL_OPTIONS } from '../../services/syncScheduler';
import { scoreLabelColor } from '../../services/syncInsights';
import type { SyncIntervalMinutes } from '../../types/syncOrchestrationTypes';

const S: Record<string, React.CSSProperties> = {
  wrap:    { padding: '32px 40px', maxWidth: 800, fontFamily: 'Inter, system-ui, sans-serif' },
  card:    { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '24px 28px', marginBottom: 20 },
  h2:      { fontSize: 16, fontWeight: 700, color: '#1e2d45', margin: '0 0 4px' },
  sub:     { fontSize: 13, color: '#6b7280', margin: '0 0 18px', lineHeight: 1.5 },
  label:   { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 },
  hint:    { display: 'block', fontSize: 11, color: '#9ca3af', marginTop: 4 },
  input:   { width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, color: '#111827', background: '#f9fafb', boxSizing: 'border-box' as const, fontFamily: 'inherit' },
  inputOk: { width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #86efac', fontSize: 14, color: '#111827', background: '#f0fdf4', boxSizing: 'border-box' as const, fontFamily: 'inherit' },
  inputRo: { width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, color: '#6b7280', background: '#f9fafb', boxSizing: 'border-box' as const, fontFamily: 'monospace' },
  grid2:   { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 20px' },
  btn:     { padding: '10px 22px', borderRadius: 8, border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8 },
  info:    { background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#1e40af', lineHeight: 1.55, marginBottom: 20 },
  warn:    { background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#92400e', lineHeight: 1.55, marginBottom: 20 },
};

interface ResolveResult { fileId: string; driveId: string; name: string; webUrl?: string; }
type TestStatus = 'idle' | 'loading' | 'ok' | 'error';

interface Props { onDataImported?: (info: { cohortName: string }) => void; }

export default function OneDriveSync({ onDataImported }: Props) {
  const { session, organization } = useAuth();
  const [cfg, setCfg]             = useState<SyncConfig>(DEFAULT_SYNC_CONFIG);
  const [cohortName, setCohortName] = useState('Incubator 11.0');
  const [saved, setSaved]         = useState(false);
  const [showSheets, setShowSheets] = useState(false);

  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testMsg, setTestMsg]       = useState('');
  const [resolved, setResolved]     = useState<ResolveResult | null>(null);

  const { state, runSync, cancelSync, takeoverLease, updateScheduler, isSyncing, leaseInfo, formatLastSync } = useOneDriveOrchestrator(
    cohortName,
    onDataImported,
  );

  useEffect(() => {
    const existing = loadSyncConfig();
    if (existing) {
      setCfg(existing);
      if (existing.resolvedFileName) {
        setResolved({ fileId: existing.oneDriveFileId, driveId: existing.oneDriveDriveId, name: existing.resolvedFileName });
        setTestStatus('ok');
        setTestMsg(`Connected to "${existing.resolvedFileName}"`);
      }
    }
  }, []);

  const set = (field: keyof SyncConfig, value: string) =>
    setCfg(prev => ({ ...prev, [field]: value }));

  const setSheet = (key: keyof SyncConfig['sheetNames'], value: string) =>
    setCfg(prev => ({ ...prev, sheetNames: { ...prev.sheetNames, [key]: value } }));

  /* ── Test connection ── */
  const handleTest = async () => {
    if (!cfg.shareUrl?.trim()) {
      setTestStatus('error');
      setTestMsg('Paste your OneDrive sharing URL first.');
      return;
    }
    setTestStatus('loading');
    setTestMsg('Contacting Microsoft Graph…');
    setResolved(null);

    try {
      const res  = await fetch('/api/resolve-share', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          shareUrl: cfg.shareUrl.trim(),
          organizationId: organization?.id,
        }),
      });
      const text = await res.text();

      if (!text.trim()) {
        setTestStatus('error');
        setTestMsg(
          res.status === 404
            ? 'API route not found — run "vercel dev" instead of "npm run dev" to enable /api/ routes.'
            : `Server returned an empty response (HTTP ${res.status}).`,
        );
        return;
      }

      let data: ResolveResult & { error?: string };
      try { data = JSON.parse(text) as ResolveResult & { error?: string }; }
      catch {
        setTestStatus('error');
        setTestMsg(`Non-JSON response (HTTP ${res.status}): ${text.slice(0, 100)}`);
        return;
      }

      if (!res.ok) { setTestStatus('error'); setTestMsg(data.error ?? `HTTP ${res.status}`); return; }

      setResolved(data);
      setTestStatus('ok');
      setTestMsg(`Connected — "${data.name}"`);
      setCfg(prev => ({ ...prev, oneDriveFileId: data.fileId, oneDriveDriveId: data.driveId, resolvedFileName: data.name }));
    } catch (err) {
      setTestStatus('error');
      const msg = (err as Error).message ?? 'Network error';
      setTestMsg(msg.includes('fetch') ? 'Could not reach /api/resolve-share — run "vercel dev" to serve API routes locally.' : msg);
    }
  };

  /* ── Save config ── */
  const handleSave = () => {
    saveSyncConfig(cfg);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleClear = () => {
    localStorage.removeItem(SYNC_CONFIG_KEY);
    setCfg(DEFAULT_SYNC_CONFIG);
    setResolved(null);
    setTestStatus('idle');
    setTestMsg('');
  };

  /* ── Sync now (browser pipeline) ── */
  const handleSync = () => {
    saveSyncConfig(cfg);
    void runSync(cfg);
  };

  const syncPhase = isSyncing ? 'syncing' : state.progress.phase === 'done' ? 'done' : state.progress.phase === 'failed' ? 'error' : 'idle';
  const syncError = state.error;
  const syncResult = state.lastResult;

  const testColors = {
    idle:    { bg: 'transparent', border: 'none',              color: '#6b7280' },
    loading: { bg: '#eff6ff',     border: '1px solid #bfdbfe', color: '#2563eb' },
    ok:      { bg: '#f0fdf4',     border: '1px solid #86efac', color: '#15803d' },
    error:   { bg: '#fef2f2',     border: '1px solid #fca5a5', color: '#dc2626' },
  }[testStatus];

  const statusIcon = {
    idle:    null,
    loading: <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />,
    ok:      <CheckCircle size={14} />,
    error:   <XCircle size={14} />,
  }[testStatus];

  return (
    <div style={S.wrap}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1e2d45', margin: '0 0 6px' }}>OneDrive Sync</h1>
      <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 24px' }}>
        Connect your OneDrive workbook and sync through the same validation → mapping → analytics pipeline as Excel upload.
      </p>

      <div style={{ ...S.card, marginBottom: 16 }}>
        <label style={S.label}>Cohort name for imported data</label>
        <input style={S.input} value={cohortName} onChange={e => setCohortName(e.target.value)} placeholder="e.g. Incubator 12.0" />
      </div>

      <div style={S.warn}>
        <strong>Prerequisites:</strong> Azure App Registration with <code style={{ background: '#fef3c7', padding: '1px 5px', borderRadius: 4 }}>Files.ReadAll</code> permission,
        and Vercel environment variables <code style={{ background: '#fef3c7', padding: '1px 5px', borderRadius: 4 }}>AZURE_TENANT_ID</code>,{' '}
        <code style={{ background: '#fef3c7', padding: '1px 5px', borderRadius: 4 }}>AZURE_CLIENT_ID</code>,{' '}
        <code style={{ background: '#fef3c7', padding: '1px 5px', borderRadius: 4 }}>AZURE_CLIENT_SECRET</code> set.
        If you haven't set these up, use <strong>Excel Upload</strong> instead.
      </div>

      {/* ── Share URL ── */}
      <div style={S.card}>
        <h2 style={S.h2}>OneDrive Workbook</h2>
        <p style={S.sub}>
          Open your Excel file in OneDrive → <strong>Share</strong> → <strong>Copy link</strong> (set to "Anyone with the link can view").
          Paste the full URL below.
        </p>

        <label style={{ display: 'block', marginBottom: 14 }}>
          <span style={S.label}>OneDrive sharing URL <span style={{ color: '#ef4444' }}>*</span></span>
          <input
            style={testStatus === 'ok' ? S.inputOk : S.input}
            placeholder="https://vigyanshaala-my.sharepoint.com/:x:/p/…"
            value={cfg.shareUrl ?? ''}
            onChange={e => { set('shareUrl', e.target.value); setTestStatus('idle'); setTestMsg(''); setResolved(null); }}
          />
          <span style={S.hint}>Full share link from OneDrive or SharePoint</span>
        </label>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button
            onClick={handleTest}
            disabled={testStatus === 'loading'}
            style={{ ...S.btn, background: '#1e2d45', color: '#fff', opacity: testStatus === 'loading' ? 0.7 : 1, cursor: testStatus === 'loading' ? 'progress' : 'pointer' }}
          >
            <Link2 size={15} />
            {testStatus === 'loading' ? 'Testing…' : 'Test Connection'}
          </button>

          {testMsg && (
            <div style={{ padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, ...testColors }}>
              {statusIcon}{testMsg}
            </div>
          )}
        </div>

        {resolved && (
          <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
            <div style={S.grid2}>
              <label style={{ display: 'block' }}>
                <span style={{ ...S.label, color: '#15803d' }}>File ID (auto-resolved)</span>
                <input style={S.inputRo} readOnly value={resolved.fileId} />
              </label>
              <label style={{ display: 'block' }}>
                <span style={{ ...S.label, color: '#15803d' }}>Drive ID (auto-resolved)</span>
                <input style={S.inputRo} readOnly value={resolved.driveId} />
              </label>
            </div>
            {resolved.webUrl && (
              <p style={{ fontSize: 12, color: '#6b7280', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileSpreadsheet size={13} />
                <a href={resolved.webUrl} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>{resolved.name}</a>
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Sheet names (collapsible) ── */}
      <div style={S.card}>
        <button
          onClick={() => setShowSheets(v => !v)}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left' }}
        >
          <h2 style={{ ...S.h2, margin: 0, flex: 1 }}>Sheet Name Mapping</h2>
          <span style={{ fontSize: 12, color: '#6b7280' }}>{showSheets ? 'Hide' : 'Customize'}</span>
        </button>
        <p style={{ ...S.sub, marginTop: 6, marginBottom: showSheets ? 14 : 0 }}>
          Exact tab names as they appear in your workbook (case-sensitive). Defaults work for the standard VigyanShaala template.
        </p>

        {showSheets && (
          <div style={S.grid2}>
            {(
              [['students', 'Student Master tab'], ['attendance', 'Attendance tab'], ['assignments', 'Assignments tab'], ['quiz', 'Quiz tab']] as [keyof SyncConfig['sheetNames'], string][]
            ).map(([key, label]) => (
              <label key={key} style={{ display: 'block' }}>
                <span style={S.label}>{label}</span>
                <input style={S.input} value={cfg.sheetNames[key]} onChange={e => setSheet(key, e.target.value)} />
              </label>
            ))}
          </div>
        )}
      </div>

      {/* ── Actions ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <button
          onClick={handleSave}
          style={{ ...S.btn, background: '#863bff', color: '#fff', padding: '10px 24px' }}
        >
          Save Configuration
        </button>
        <button
          onClick={handleClear}
          style={{ ...S.btn, background: 'transparent', color: '#ef4444', border: '1px solid #fca5a5' }}
        >
          Clear All
        </button>
        {saved && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, color: '#15803d', fontSize: 13, fontWeight: 500 }}>
            <CheckCircle size={14} /> Saved
          </div>
        )}
      </div>

      {/* ── Sync Now + scheduler ── */}
      <div style={S.card}>
        <h2 style={S.h2}>Sync & Auto-Refresh</h2>
        <p style={S.sub}>Pull the latest workbook, validate, map columns, and refresh the dashboard in-browser.</p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 14 }}>
          <span style={{
            padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
            background: isSyncing ? '#eff6ff' : state.schedulerPrefs.lastSyncStatus === 'success' ? '#f0fdf4' : '#f3f4f6',
            color: isSyncing ? '#2563eb' : state.schedulerPrefs.lastSyncStatus === 'failed' ? '#dc2626' : '#374151',
          }}>
            {isSyncing ? state.progress.phase : state.schedulerPrefs.lastSyncStatus ?? 'idle'}
          </span>
          <span style={{ fontSize: 12, color: '#6b7280' }}>
            Last synced: {formatLastSync(state.schedulerPrefs.lastSyncAt)}
          </span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={state.schedulerPrefs.autoSyncEnabled}
              onChange={e => updateScheduler({ autoSyncEnabled: e.target.checked, paused: false })}
            />
            Auto sync
          </label>
          <select
            value={String(state.schedulerPrefs.intervalMinutes)}
            onChange={e => {
              const v = e.target.value;
              updateScheduler({
                intervalMinutes: (v === 'manual' ? 'manual' : Number(v)) as SyncIntervalMinutes,
              });
            }}
            style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontFamily: 'inherit', fontSize: 13 }}
          >
            {INTERVAL_OPTIONS.map(o => (
              <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => updateScheduler({ paused: !state.schedulerPrefs.paused })}
            style={{ ...S.btn, background: '#f3f4f6', color: '#374151', padding: '8px 12px', fontSize: 12 }}
          >
            {state.schedulerPrefs.paused ? <><Play size={14} /> Resume</> : <><Pause size={14} /> Pause</>}
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <button
            onClick={handleSync}
            disabled={isSyncing || testStatus !== 'ok'}
            style={{
              ...S.btn,
              background: testStatus === 'ok' ? '#2F4F7F' : '#d1d5db',
              color: '#fff',
              padding: '11px 26px',
              fontSize: 15,
              opacity: isSyncing ? 0.7 : 1,
              cursor: isSyncing || testStatus !== 'ok' ? 'not-allowed' : 'pointer',
            }}
          >
            <RefreshCw size={16} style={isSyncing ? { animation: 'spin 1s linear infinite' } : {}} />
            {isSyncing ? state.progress.message : 'Sync Now'}
          </button>

          {isSyncing && (
            <button type="button" onClick={cancelSync} style={{ ...S.btn, background: '#fff', color: '#dc2626', border: '1px solid #fca5a5' }}>
              Cancel
            </button>
          )}

          {testStatus !== 'ok' && (
            <span style={{ fontSize: 13, color: '#6b7280' }}>Test connection first to enable sync.</span>
          )}
        </div>

        {isSyncing && (
          <div style={{ marginTop: 12 }}>
            <div style={{ height: 6, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${state.progress.pct}%`, background: '#2563eb', transition: 'width 0.2s' }} />
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>{state.progress.message}</div>
          </div>
        )}

        {/* Sync result */}
        {(leaseInfo.foreignTabActive || leaseInfo.canTakeoverStale) && !isSyncing && (
          <div style={{ ...S.warn, marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span>
              {leaseInfo.foreignTabActive
                ? `Sync owned by another tab${leaseInfo.lease?.tabLabel ? `: ${leaseInfo.lease.tabLabel}` : ''}.`
                : 'Stale sync lease detected from a previous session.'}
            </span>
            {(leaseInfo.canTakeoverStale || leaseInfo.isStale) && (
              <button
                type="button"
                onClick={() => takeoverLease()}
                style={{ ...S.btn, background: '#1e2d45', color: '#fff', fontSize: 12, padding: '6px 12px' }}
              >
                Take over sync
              </button>
            )}
          </div>
        )}

        {syncPhase === 'error' && syncError && (
          <div style={{ marginTop: 16, padding: '14px 16px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, fontSize: 13, color: '#dc2626' }}>
            <strong>Sync failed — previous dashboard preserved.</strong> {syncError}
            <button type="button" onClick={handleSync} style={{ ...S.btn, marginTop: 10, background: '#1e2d45', color: '#fff', fontSize: 12 }}>
              Retry sync
            </button>
          </div>
        )}

        {syncPhase === 'done' && syncResult && (
          <div style={{ marginTop: 16 }}>
            <div style={{
              padding: '14px 16px', borderRadius: 10, marginBottom: 14,
              background: syncResult.status === 'success' ? '#f0fdf4' : '#fffbeb',
              border: `1px solid ${syncResult.status === 'success' ? '#86efac' : '#fde68a'}`,
              color: syncResult.status === 'success' ? '#15803d' : '#92400e',
              fontSize: 13,
            }}>
              <strong>{syncResult.status === 'success' ? 'Sync completed' : 'Sync completed with warnings'}</strong>
              {' '}· {syncResult.rowCount.toLocaleString()} rows · {syncResult.durationMs}ms
              {syncResult.healthScore && (
                <span style={{ marginLeft: 8, color: scoreLabelColor(syncResult.healthScore) }}>
                  ({syncResult.healthScore})
                </span>
              )}
            </div>

            {syncResult.insights.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#374151', lineHeight: 1.6 }}>
                {syncResult.insights.map((line, i) => <li key={i}>{line}</li>)}
              </ul>
            )}

            {syncResult.requiresMappingReview && (
              <div style={{ marginTop: 10, fontSize: 12, color: '#92400e' }}>
                Review column mapping on the Excel Upload tab if KPIs look incomplete.
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Cron schedule note ── */}
      <div style={{ ...S.info, marginBottom: 0 }}>
        <strong>Automatic schedule:</strong> Set to <strong>every Monday at 07:30 IST</strong> via Vercel Cron
        (<code style={{ background: '#dbeafe', padding: '1px 5px', borderRadius: 4 }}>0 2 * * 1</code> in <code style={{ background: '#dbeafe', padding: '1px 5px', borderRadius: 4 }}>vercel.json</code>).
        Adjust the cron expression to change the schedule.
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
