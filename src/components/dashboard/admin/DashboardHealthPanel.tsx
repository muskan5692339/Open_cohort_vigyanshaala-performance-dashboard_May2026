import { getDashboardHealth } from '../../../services/dashboardHealthMonitor';
import type { DashboardHealthMetrics, HealthStatus } from '../../../types/productionTypes';
import { BRAND } from '../../../types/adminTypes';

const STATUS_COLOR: Record<HealthStatus, string> = {
  ok: BRAND.green,
  warning: '#d97706',
  error: BRAND.red,
  idle: BRAND.textLight,
};

export default function DashboardHealthPanel() {
  const health: DashboardHealthMetrics = getDashboardHealth();

  return (
    <div style={{ background: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Dashboard Health Monitor</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <Metric label="Upload success rate" value={`${health.uploadSuccessRate}%`} sub={`${health.uploadSuccesses}/${health.uploadAttempts} attempts`} />
        <Metric label="Mapping success rate" value={`${health.mappingSuccessRate}%`} sub={`${health.mappingSuccesses}/${health.mappingAttempts} attempts`} />
        <Metric label="Analytics generation" value={health.analyticsStatus} sub={health.analyticsLastMs != null ? `${health.analyticsLastMs}ms · ${health.analyticsRowCount ?? 0} rows` : 'Not run yet'} color={STATUS_COLOR[health.analyticsStatus]} />
        <Metric label="Export status" value={health.exportStatus} sub={health.exportLastAt ? new Date(health.exportLastAt).toLocaleString() : 'No exports yet'} color={STATUS_COLOR[health.exportStatus]} />
      </div>
      <div style={{ fontSize: 11, color: BRAND.textLight, marginTop: 12 }}>Last updated {new Date(health.lastUpdated).toLocaleString()}</div>
    </div>
  );
}

function Metric({ label, value, sub, color }: { label: string; value: string; sub: string; color?: string }) {
  return (
    <div style={{ background: BRAND.bg, borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 11, color: BRAND.textLight, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: color ?? BRAND.navy, marginTop: 4, textTransform: 'capitalize' }}>{value}</div>
      <div style={{ fontSize: 11, color: BRAND.textLight, marginTop: 4 }}>{sub}</div>
    </div>
  );
}
