import type { SchemaMigrationSummary } from '../../types/productionTypes';
import { BRAND } from '../../types/adminTypes';

export default function SchemaMigrationPanel({ summary }: { summary: SchemaMigrationSummary }) {
  return (
    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: 12, marginBottom: 14 }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: '#92400e', marginBottom: 6 }}>Schema Change Detector</div>
      <div style={{ fontSize: 13, color: '#78350f', marginBottom: 10 }}>{summary.summaryText}</div>
      {summary.changes.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#78350f', display: 'grid', gap: 4 }}>
          {summary.changes.slice(0, 15).map((c, i) => (
            <li key={`${c.kind}-${c.column}-${i}`}>{c.message}</li>
          ))}
          {summary.changes.length > 15 && <li>…and {summary.changes.length - 15} more changes</li>}
        </ul>
      )}
      {!summary.hasPreviousProfile && (
        <div style={{ fontSize: 12, color: BRAND.textLight, marginTop: 8 }}>
          Save a mapping profile after review to enable migration summaries on future uploads.
        </div>
      )}
    </div>
  );
}
