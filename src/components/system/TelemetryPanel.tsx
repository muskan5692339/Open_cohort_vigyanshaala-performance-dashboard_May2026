import { useMemo, useState } from 'react';
import { Activity, AlertTriangle, Clock, RefreshCw } from 'lucide-react';
import { aggregateTelemetry } from '../../services/telemetryAggregator';
import { listQueueItems, requeueDeadLetter } from '../../services/cloudSyncQueue';
import { BRAND } from '../../types/adminTypes';

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div
      tabIndex={0}
      style={{
        background: BRAND.bg,
        borderRadius: 10,
        padding: 12,
        border: `1px solid ${BRAND.border}`,
        outline: 'none',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = BRAND.navy;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = BRAND.border;
        e.currentTarget.style.boxShadow = 'none';
      }}
      onFocus={e => {
        e.currentTarget.style.borderColor = BRAND.navy;
        e.currentTarget.style.boxShadow = `0 0 0 2px ${BRAND.navy}33`;
      }}
      onBlur={e => {
        e.currentTarget.style.borderColor = BRAND.border;
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <div style={{ fontSize: 11, color: BRAND.textLight, fontWeight: 600, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: BRAND.navy, marginTop: 4 }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: BRAND.textLight, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function formatMs(ms: number | undefined): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function TelemetryPanel() {
  const [queueTick, setQueueTick] = useState(0);
  const metrics = useMemo(() => aggregateTelemetry(), [queueTick]);
  const deadLetter = useMemo(() => listQueueItems('dead_letter'), [queueTick]);

  const trendColor =
    metrics.schemaStability.trend === 'stable'
      ? BRAND.green
      : metrics.schemaStability.trend === 'watch'
        ? '#d97706'
        : BRAND.red;

  return (
    <div style={{ background: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 16, marginBottom: 12 }}>
        <Activity size={18} /> System Telemetry
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
        <StatCard
          label="Avg upload"
          value={formatMs(metrics.uploadTiming?.avgMs)}
          hint={metrics.uploadTiming ? `p95 ${formatMs(metrics.uploadTiming.p95Ms)} · ${metrics.uploadTiming.successRate}% ok` : 'No uploads yet'}
        />
        <StatCard
          label="Avg sync"
          value={formatMs(metrics.syncTiming?.avgMs)}
          hint={metrics.syncTiming ? `p95 ${formatMs(metrics.syncTiming.p95Ms)} · ${metrics.syncTiming.count} runs` : 'No syncs yet'}
        />
        <StatCard
          label="Queue health"
          value={metrics.queueHealth.paused ? 'Paused' : `${metrics.queueHealth.pending + metrics.queueHealth.retrying} pending`}
          hint={`${metrics.queueHealth.deadLetter} dead-letter · ${metrics.queueHealth.failureRate}% fail rate`}
        />
        <StatCard
          label="Schema trend"
          value={metrics.schemaStability.trend}
          hint={`${metrics.schemaStability.driftEvents} drift · ${metrics.schemaStability.instabilityEvents} unstable`}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: BRAND.textLight }}>
          <div style={{ fontWeight: 700, color: BRAND.text, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={14} /> Timing summary
          </div>
          <div>Export avg: {formatMs(metrics.exportTiming?.avgMs)}</div>
          <div>Restore avg: {formatMs(metrics.restoreTiming?.avgMs)}</div>
          <div>Mapping reviews: {metrics.mappingReviewRate}% of events</div>
          <div>Sync cancellations: {metrics.syncCancellationRate}%</div>
          <div>OneDrive fetch failures: {metrics.onedriveFetchFailureRate}%</div>
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6, color: trendColor }}>
            Schema stability (7d)
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 48 }}>
            {metrics.dailyBuckets.slice(0, 7).reverse().map(b => (
              <div
                key={b.date}
                title={`${b.date}: ${b.failures} failures`}
                style={{
                  flex: 1,
                  height: `${Math.max(8, Math.min(48, b.failures * 12 + 8))}px`,
                  background: b.failures ? '#fca5a5' : '#86efac',
                  borderRadius: 4,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {(metrics.recentFailures.length > 0 || deadLetter.length > 0) && (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={14} color={BRAND.red} /> Recent failures
          </div>
          <div style={{ display: 'grid', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
            {metrics.recentFailures.map((f, i) => (
              <div key={`${f.at}-${i}`} style={{ fontSize: 12, padding: 8, background: BRAND.bg, borderRadius: 8 }}>
                <strong>{f.source}</strong>
                <span style={{ color: BRAND.textLight }}> · {new Date(f.at).toLocaleString()}</span>
                <div style={{ color: BRAND.textLight, marginTop: 2 }}>{f.message}</div>
              </div>
            ))}
            {deadLetter.slice(0, 5).map(item => (
              <div
                key={item.id}
                style={{ fontSize: 12, padding: 8, background: '#fef2f2', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 6 }}
              >
                <div>
                  <strong>dead_letter</strong>
                  <span style={{ color: BRAND.textLight }}> · {item.endpoint.split('/').pop()}</span>
                  <div style={{ color: BRAND.textLight, marginTop: 2 }}>{item.lastError?.slice(0, 120) ?? 'Max retries exceeded'}</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (requeueDeadLetter(item.id)) setQueueTick(t => t + 1);
                  }}
                  style={{
                    alignSelf: 'flex-start',
                    fontSize: 11,
                    padding: '4px 8px',
                    borderRadius: 6,
                    border: `1px solid ${BRAND.border}`,
                    background: '#fff',
                    cursor: 'pointer',
                  }}
                  onFocus={e => {
                    e.currentTarget.style.outline = `2px solid ${BRAND.navy}55`;
                  }}
                  onBlur={e => {
                    e.currentTarget.style.outline = 'none';
                  }}
                >
                  Requeue
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 12, fontSize: 11, color: BRAND.textLight, display: 'flex', alignItems: 'center', gap: 4 }}>
        <RefreshCw size={12} /> Local-first telemetry · optional cloud sync later
      </div>
    </div>
  );
}
