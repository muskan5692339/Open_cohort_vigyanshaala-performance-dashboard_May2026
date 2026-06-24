import { useState, useEffect } from 'react';
import type { SyncConfig } from '../../../types/syncTypes';
import { DEFAULT_SYNC_CONFIG, SYNC_CONFIG_KEY } from '../../../types/syncTypes';
import { loadSyncConfig, saveSyncConfig } from '../../../services/oneDriveSync';
import { useAuth } from '../../../context/AuthContext';

/* ── Styles ─────────────────────────────────────────────── */
const S: Record<string, React.CSSProperties> = {
  wrap:    { padding: '32px 40px', maxWidth: 780, fontFamily: 'Inter, system-ui, sans-serif' },
  card:    { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '26px 30px', marginBottom: 20 },
  h2:      { fontSize: 17, fontWeight: 700, color: '#1e2d45', margin: '0 0 4px' },
  sub:     { fontSize: 13, color: '#6b7280', margin: '0 0 20px', lineHeight: 1.5 },
  label:   { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 },
  hint:    { display: 'block', fontSize: 11, color: '#9ca3af', marginTop: 4, lineHeight: 1.4 },
  input:   { width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, color: '#111827', background: '#f9fafb', boxSizing: 'border-box' as const, fontFamily: 'inherit' },
  inputOk: { width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #86efac', fontSize: 14, color: '#111827', background: '#f0fdf4', boxSizing: 'border-box' as const, fontFamily: 'inherit' },
  inputRo: { width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, color: '#6b7280', background: '#f9fafb', boxSizing: 'border-box' as const, fontFamily: 'monospace', letterSpacing: 0.2 },
  grid2:   { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 20px' },
  btn:     { padding: '10px 22px', borderRadius: 8, border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' },
  info:    { background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#1e40af', lineHeight: 1.55, marginBottom: 20 },
};

interface ResolveResult {
  fileId: string;
  driveId: string;
  name: string;
  webUrl?: string;
}

type TestStatus = 'idle' | 'loading' | 'ok' | 'error';

interface Props { onSaved?: () => void; }

export default function SyncConfigPanel({ onSaved }: Props) {
  const { session, organization } = useAuth();
  const [cfg, setCfg] = useState<SyncConfig>(DEFAULT_SYNC_CONFIG);
  const [saved, setSaved] = useState(false);

  // Test-connection state
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testMsg, setTestMsg]       = useState('');
  const [resolved, setResolved]     = useState<ResolveResult | null>(null);

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
      const res = await fetch('/api/resolve-share', {
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

      // Read as text first — .json() on an empty body throws "Unexpected end of JSON input"
      const text = await res.text();

      if (!text.trim()) {
        setTestStatus('error');
        setTestMsg(
          res.status === 404
            ? 'API route not found (HTTP 404). Run "vercel dev" instead of "npm run dev" to enable /api/ routes locally. Install with: npm i -g vercel'
            : `Server returned an empty response (HTTP ${res.status}). Check Vercel function logs for details.`,
        );
        return;
      }

      let data: ResolveResult & { error?: string; code?: string };
      try {
        data = JSON.parse(text) as ResolveResult & { error?: string; code?: string };
      } catch {
        setTestStatus('error');
        setTestMsg(
          res.status === 404
            ? 'API route not found — run "vercel dev" (not "npm run dev") to test /api/ routes locally.'
            : `Non-JSON response (HTTP ${res.status}): ${text.slice(0, 120)}`,
        );
        return;
      }

      if (!res.ok) {
        setTestStatus('error');
        setTestMsg(data.error ?? `HTTP ${res.status}`);
        return;
      }

      setResolved(data);
      setTestStatus('ok');
      setTestMsg(`Connected — "${data.name}"`);

      // Auto-populate file ID + drive ID
      setCfg(prev => ({
        ...prev,
        oneDriveFileId:   data.fileId,
        oneDriveDriveId:  data.driveId,
        resolvedFileName: data.name,
      }));
    } catch (err) {
      setTestStatus('error');
      const msg = (err as Error).message ?? 'Network error';
      setTestMsg(
        msg.includes('fetch')
          ? 'Could not reach /api/resolve-share. Run "vercel dev" (not "npm run dev") to serve API routes locally.'
          : msg,
      );
    }
  };

  /* ── Save / clear ── */
  const handleSave = () => {
    saveSyncConfig(cfg);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    onSaved?.();
  };

  const handleClear = () => {
    localStorage.removeItem(SYNC_CONFIG_KEY);
    setCfg(DEFAULT_SYNC_CONFIG);
    setResolved(null);
    setTestStatus('idle');
    setTestMsg('');
  };

  /* ── Status badge colours ── */
  const testColors = {
    idle:    { bg: 'transparent', border: 'none',           color: '#6b7280' },
    loading: { bg: '#eff6ff',     border: '1px solid #bfdbfe', color: '#2563eb' },
    ok:      { bg: '#f0fdf4',     border: '1px solid #86efac', color: '#15803d' },
    error:   { bg: '#fef2f2',     border: '1px solid #fca5a5', color: '#dc2626' },
  }[testStatus];

  return (
    <div style={S.wrap}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1e2d45', margin: '0 0 6px' }}>Sync Configuration</h1>
      <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 24px', lineHeight: 1.6 }}>
        Paste your OneDrive sharing URL and click <strong>Test Connection</strong> — the File ID and Drive ID
        are resolved automatically. Sensitive credentials live in Vercel environment variables only.
      </p>

      <div style={S.info}>
        <strong>Secure setup:</strong> Your <code style={{ background: '#dbeafe', padding: '1px 5px', borderRadius: 4 }}>AZURE_CLIENT_SECRET</code> and{' '}
        <code style={{ background: '#dbeafe', padding: '1px 5px', borderRadius: 4 }}>SUPABASE_SERVICE_ROLE_KEY</code> are
        stored as Vercel environment variables and never sent to the browser.
      </div>

      {/* ── OneDrive sharing URL ── */}
      <div style={S.card}>
        <h2 style={S.h2}>OneDrive Workbook</h2>
        <p style={S.sub}>
          Open your Excel file in OneDrive → <strong>Share</strong> → <strong>Copy link</strong> (set to "Anyone with the link can view").
          Paste the full URL below.
        </p>

        <label style={{ display: 'block', marginBottom: 14 }}>
          <span style={S.label}>OneDrive sharing URL <span style={{ color: '#ef4444' }}>*</span></span>
          <input
            style={S.input}
            placeholder="https://vigyanshaala-my.sharepoint.com/:x:/p/managing_trustee/…"
            value={cfg.shareUrl ?? ''}
            onChange={e => { set('shareUrl', e.target.value); setTestStatus('idle'); setTestMsg(''); }}
          />
          <span style={S.hint}>Full share link from OneDrive or SharePoint</span>
        </label>

        {/* Test button + status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button
            onClick={handleTest}
            disabled={testStatus === 'loading'}
            style={{
              ...S.btn,
              background: '#1e2d45',
              color: '#fff',
              opacity: testStatus === 'loading' ? 0.7 : 1,
              cursor: testStatus === 'loading' ? 'progress' : 'pointer',
            }}
          >
            {testStatus === 'loading' ? 'Testing…' : 'Test Connection'}
          </button>

          {testMsg && (
            <div style={{ padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, ...testColors }}>
              {testStatus === 'ok' && '✓ '}
              {testStatus === 'error' && '✗ '}
              {testMsg}
            </div>
          )}
        </div>

        {/* Auto-populated IDs (read-only display) */}
        {resolved && (
          <div style={{ marginTop: 18, display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
              <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>
                File: <a href={resolved.webUrl} target="_blank" rel="noreferrer" style={{ color: '#863bff' }}>{resolved.name}</a>
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Sheet names ── */}
      <div style={S.card}>
        <h2 style={S.h2}>Sheet Name Mapping</h2>
        <p style={S.sub}>Exact tab names as they appear in your workbook (case-sensitive).</p>
        <div style={S.grid2}>
          {(
            [
              ['students',    'Student Master tab'],
              ['attendance',  'Attendance tab'],
              ['assignments', 'Assignments tab'],
              ['quiz',        'Quiz tab'],
            ] as [keyof SyncConfig['sheetNames'], string][]
          ).map(([key, label]) => (
            <label key={key} style={{ display: 'block' }}>
              <span style={S.label}>{label}</span>
              <input style={S.input} value={cfg.sheetNames[key]} onChange={e => setSheet(key, e.target.value)} />
            </label>
          ))}
        </div>
      </div>

      {/* ── Sync frequency ── */}
      <div style={S.card}>
        <h2 style={S.h2}>Automatic Sync Schedule</h2>
        <p style={S.sub}>
          Vercel Cron calls <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: 4 }}>POST /api/sync</code> on
          this schedule. Adjust the cron expression in <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: 4 }}>vercel.json</code>.
          Currently set to <strong>every Monday at 07:30 IST</strong>.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          {(['manual', 'daily', 'weekly'] as SyncConfig['syncFrequency'][]).map(f => (
            <button
              key={f}
              onClick={() => setCfg(prev => ({ ...prev, syncFrequency: f }))}
              style={{
                ...S.btn,
                background: cfg.syncFrequency === f ? '#1e2d45' : '#f3f4f6',
                color:      cfg.syncFrequency === f ? '#fff'    : '#374151',
                border:     cfg.syncFrequency === f ? 'none'    : '1px solid #e5e7eb',
                textTransform: 'capitalize',
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* ── Server env vars reference ── */}
      <div style={{ ...S.card, background: '#fafafa' }}>
        <h2 style={S.h2}>Server Environment Variables</h2>
        <p style={S.sub}>Set these once in Vercel Dashboard → Project → Settings → Environment Variables. Never stored in the browser.</p>
        <div style={{ display: 'grid', gap: 7, fontSize: 13 }}>
          {[
            ['AZURE_TENANT_ID',          '854d4f5c-3158-4a51-9ad4-3f0078ede0b6',  'Azure Directory (tenant) ID'],
            ['AZURE_CLIENT_ID',          'bdd08546-caa6-4620-8b89-fa1a25dd4906',  'Azure Application (client) ID'],
            ['AZURE_CLIENT_SECRET',      '(secret value from Certificates & secrets)', 'Client secret VALUE — not the ID'],
            ['SUPABASE_SERVICE_ROLE_KEY','(your service_role JWT)',                 'Supabase Project Settings → API → service_role'],
            ['VITE_SUPABASE_URL',        'https://cccltbexauqpsuxebqoa.supabase.co','Supabase Project URL'],
            ['VITE_SUPABASE_ANON_KEY',   '(your anon key)',                         'Supabase anon public key'],
          ].map(([k, v, desc]) => (
            <div key={k} style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 10, padding: '8px 12px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, alignItems: 'start' }}>
              <code style={{ fontFamily: 'monospace', fontSize: 12, color: '#1e2d45' }}>{k}</code>
              <div>
                <div style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>{desc}</div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{v}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Actions ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button
          onClick={handleSave}
          style={{ ...S.btn, background: '#863bff', color: '#fff', padding: '12px 30px', fontSize: 15 }}
        >
          Save configuration
        </button>
        <button
          onClick={handleClear}
          style={{ ...S.btn, background: 'transparent', color: '#ef4444', border: '1px solid #fca5a5' }}
        >
          Clear all
        </button>
        {saved && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, color: '#15803d', fontSize: 13, fontWeight: 500 }}>
            ✓ Saved to local storage
          </div>
        )}
      </div>

      {cfg.lastConfigured && (
        <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 14 }}>
          Last saved: {new Date(cfg.lastConfigured).toLocaleString()}
        </p>
      )}
    </div>
  );
}
