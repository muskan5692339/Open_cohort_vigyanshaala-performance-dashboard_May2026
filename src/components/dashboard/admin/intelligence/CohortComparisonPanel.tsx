import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CohortComparisonDimension } from '../../../../types/intelligenceTypes';
import { BRAND } from '../../../../types/adminTypes';

export default function CohortComparisonPanel({ comparisons }: { comparisons: CohortComparisonDimension[] }) {
  if (!comparisons.length) {
    return (
      <div style={{ padding: 20, color: BRAND.textLight, fontSize: 13, background: '#fff', borderRadius: 12, border: `1px dashed ${BRAND.border}` }}>
        No category columns mapped for group comparison (Cohort, College, State, Program).
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {comparisons.map(dim => (
        <div key={dim.column} style={{ background: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: BRAND.navy, marginBottom: 12 }}>{dim.label} Comparison</div>
          <div style={{ height: 240, marginBottom: 14 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dim.rows.slice(0, 12)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="groupValue" interval={0} angle={-15} textAnchor="end" height={60} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="compositeScore" fill={BRAND.navy} name="Composite" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['Group', 'Students', 'Attendance', 'Assessment', 'Completion', 'Certification', 'Risk %', 'Composite'].map(h => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dim.rows.map(r => (
                  <tr key={r.groupValue}>
                    <td style={td}>{r.groupValue}</td>
                    <td style={td}>{r.studentCount}</td>
                    <td style={td}>{r.avgAttendance}%</td>
                    <td style={td}>{r.avgAssessment}%</td>
                    <td style={td}>{r.completionRate}%</td>
                    <td style={td}>{r.certificationRate}%</td>
                    <td style={td}>{r.riskPercent}%</td>
                    <td style={td}><strong>{r.compositeScore}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

const th: React.CSSProperties = { textAlign: 'left', padding: '8px', borderBottom: `1px solid ${BRAND.border}`, color: BRAND.textLight, fontSize: 11 };
const td: React.CSSProperties = { padding: '8px', borderBottom: `1px solid ${BRAND.borderLight}` };
