import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import type { TrendMetric } from '../../../../types/intelligenceTypes';
import { BRAND } from '../../../../types/adminTypes';

export default function TrendComparisonPanel({ trends }: { trends: TrendMetric[] }) {
  const hasPrevious = trends.some(t => t.previous !== null);

  if (!hasPrevious) {
    return (
      <div style={{ padding: 16, background: '#fff', border: `1px dashed ${BRAND.border}`, borderRadius: 12, fontSize: 13, color: BRAND.textLight }}>
        Upload a second workbook to compare trends between uploads. The first snapshot is saved automatically.
      </div>
    );
  }

  return (
    <div style={{ background: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 14 }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Trend vs Previous Upload</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
        {trends.map(t => (
          <div key={t.label} style={{ border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: 12, background: BRAND.bg }}>
            <div style={{ fontSize: 12, color: BRAND.textLight }}>{t.label}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: BRAND.navy }}>
                {t.current}{t.unit === '%' ? '%' : ''}
              </span>
              {t.direction === 'improved' && <ArrowUp size={18} color={BRAND.green} />}
              {t.direction === 'declined' && <ArrowDown size={18} color={BRAND.red} />}
              {t.direction === 'unchanged' && <Minus size={18} color={BRAND.textLight} />}
            </div>
            {t.previous !== null && (
              <div style={{ fontSize: 11, color: BRAND.textLight, marginTop: 4 }}>
                Previous: {t.previous}{t.unit === '%' ? '%' : ''}
                {t.delta !== null && (
                  <span style={{ marginLeft: 6, fontWeight: 600, color: t.direction === 'improved' ? BRAND.green : t.direction === 'declined' ? BRAND.red : BRAND.text }}>
                    ({t.delta > 0 ? '+' : ''}{t.delta}{t.unit === '%' && t.deltaPercent !== null ? `, ${t.deltaPercent}%` : ''})
                  </span>
                )}
              </div>
            )}
            <div style={{ fontSize: 11, marginTop: 4, textTransform: 'capitalize', fontWeight: 600, color: t.direction === 'improved' ? BRAND.green : t.direction === 'declined' ? BRAND.red : BRAND.textLight }}>
              {t.direction}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
