import type { OperationsHealthScore } from '../../../../types/intelligenceTypes';
import { BRAND } from '../../../../types/adminTypes';

const CATEGORY_COLOR: Record<OperationsHealthScore['category'], string> = {
  Excellent: BRAND.green,
  Good: BRAND.blue,
  'Needs Attention': '#d97706',
  Critical: BRAND.red,
};

export default function OperationsHealthPanel({ health }: { health: OperationsHealthScore }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 20 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 20 }}>
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: '50%',
            border: `8px solid ${CATEGORY_COLOR[health.category]}`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ fontSize: 32, fontWeight: 800, color: BRAND.navy }}>{health.score}</div>
          <div style={{ fontSize: 11, color: BRAND.textLight }}>/ 100</div>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: CATEGORY_COLOR[health.category] }}>{health.category}</div>
          <div style={{ fontSize: 13, color: BRAND.textLight, marginTop: 4 }}>Operations Health Score</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginTop: 14 }}>
            {Object.entries(health.components).map(([k, v]) => (
              <div key={k} style={{ background: BRAND.bg, borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ fontSize: 10, color: BRAND.textLight, textTransform: 'capitalize' }}>{k.replace(/([A-Z])/g, ' $1')}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: BRAND.navy }}>{String(v)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
