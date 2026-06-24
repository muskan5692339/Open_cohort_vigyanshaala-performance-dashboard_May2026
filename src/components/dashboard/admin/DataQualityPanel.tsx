import { AlertCircle, AlertTriangle, Info } from 'lucide-react';
import type { DataQualityReport } from '../../../types/opsTypes';
import { BRAND } from '../../../types/adminTypes';

interface DataQualityPanelProps {
  report: DataQualityReport;
  totalRows: number;
}

export default function DataQualityPanel({ report, totalRows }: DataQualityPanelProps) {
  const errors = report.issues.filter(i => i.severity === 'error');
  const warnings = report.issues.filter(i => i.severity === 'warning');

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ background: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Data Quality Panel</div>
        <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
          <span style={{ color: BRAND.red, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertCircle size={16} /> {errors.length} errors
          </span>
          <span style={{ color: '#d97706', display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={16} /> {warnings.length} warnings
          </span>
          <span style={{ color: BRAND.textLight }}>{totalRows} total rows analyzed</span>
        </div>
      </div>

      {report.issues.length === 0 ? (
        <div style={{ padding: 20, background: BRAND.greenLight, borderRadius: 12, color: BRAND.greenDark, fontSize: 13 }}>
          <Info size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          No data quality issues detected.
        </div>
      ) : (
        <div style={{ background: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Warnings & Issues</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {report.issues.slice(0, 30).map((issue, i) => (
              <div
                key={`${issue.category}-${i}`}
                style={{
                  padding: '8px 10px',
                  borderRadius: 8,
                  fontSize: 12,
                  background: issue.severity === 'error' ? BRAND.redLight : '#fffbeb',
                  color: issue.severity === 'error' ? BRAND.red : '#92400e',
                  border: `1px solid ${issue.severity === 'error' ? '#fecaca' : '#fde68a'}`,
                }}
              >
                {issue.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {Object.keys(report.missingValueCounts).length > 0 && (
        <QualityTable
          title="Missing Values"
          headers={['Column', 'Missing Count', '% of Rows']}
          rows={Object.entries(report.missingValueCounts).map(([col, count]) => [
            col,
            String(count),
            `${Math.round((count / totalRows) * 100)}%`,
          ])}
        />
      )}

      {report.duplicateIdentifierGroups.length > 0 && (
        <QualityTable
          title="Duplicate Identifiers"
          headers={['Column', 'Value', 'Count']}
          rows={report.duplicateIdentifierGroups.map(d => [d.column, d.value, String(d.count)])}
        />
      )}

      {report.unmappedColumns.length > 0 && (
        <QualityTable
          title="Unmapped Columns"
          headers={['Column']}
          rows={report.unmappedColumns.map(c => [c])}
        />
      )}

      {report.lowConfidenceColumns.length > 0 && (
        <QualityTable
          title="Low-Confidence Mappings"
          headers={['Column', 'Type Confidence', 'Role Confidence']}
          rows={report.lowConfidenceColumns.map(c => [
            c.column,
            `${Math.round(c.typeConfidence * 100)}%`,
            `${Math.round(c.roleConfidence * 100)}%`,
          ])}
        />
      )}
    </div>
  );
}

function QualityTable({ title, headers, rows }: { title: string; headers: string[]; rows: string[][] }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 14, overflowX: 'auto' }}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>{title}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            {headers.map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: `1px solid ${BRAND.border}`, color: BRAND.textLight }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} style={{ padding: '6px 8px', borderBottom: `1px solid ${BRAND.borderLight}` }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
