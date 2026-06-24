import { AlertCircle, AlertTriangle, Info } from 'lucide-react';
import type { SmartAlert } from '../../../../types/intelligenceTypes';
import { BRAND } from '../../../../types/adminTypes';

export default function SmartAlertsBanner({ alerts }: { alerts: SmartAlert[] }) {
  if (!alerts.length) return null;

  const icon = (s: SmartAlert['severity']) => {
    if (s === 'critical') return <AlertCircle size={18} />;
    if (s === 'warning') return <AlertTriangle size={18} />;
    return <Info size={18} />;
  };

  const style = (s: SmartAlert['severity']) => {
    if (s === 'critical') return { bg: BRAND.redLight, border: '#fecaca', color: BRAND.red };
    if (s === 'warning') return { bg: '#fffbeb', border: '#fde68a', color: '#92400e' };
    return { bg: '#eff6ff', border: '#bfdbfe', color: '#1e40af' };
  };

  return (
    <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
      {alerts.map(alert => {
        const s = style(alert.severity);
        return (
          <div
            key={alert.id}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              padding: '12px 14px',
              borderRadius: 10,
              background: s.bg,
              border: `1px solid ${s.border}`,
              color: s.color,
            }}
          >
            {icon(alert.severity)}
            <div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{alert.title}</div>
              <div style={{ fontSize: 12, marginTop: 2, opacity: 0.9 }}>{alert.message}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
