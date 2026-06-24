import type { TopPerformerIntelligence } from '../../../../types/intelligenceTypes';
import { BRAND } from '../../../../types/adminTypes';

function LeaderTable({ title, rows }: { title: string; rows: TopPerformerIntelligence['students'] }) {
  if (!rows.length) return null;
  return (
    <div style={{ background: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 12 }}>
      <div style={{ fontWeight: 700, color: BRAND.navy, marginBottom: 8 }}>{title}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            {['#', 'Name', 'Attendance', 'Assessment', 'Certification', 'Composite'].map(h => (
              <th key={h} style={th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={`${title}-${r.rank}-${r.label}`}>
              <td style={td}>{r.rank}</td>
              <td style={td}>{r.label}</td>
              <td style={td}>{r.attendance}%</td>
              <td style={td}>{r.assessment}%</td>
              <td style={td}>{r.certification}%</td>
              <td style={td}><strong>{r.compositeScore}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function TopPerformerPanel({ data }: { data: TopPerformerIntelligence }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
      <LeaderTable title="Top Students" rows={data.students} />
      <LeaderTable title="Top Colleges" rows={data.colleges} />
      <LeaderTable title="Top Cohorts" rows={data.cohorts} />
      <LeaderTable title="Top Programs" rows={data.programs} />
    </div>
  );
}

const th: React.CSSProperties = { textAlign: 'left', padding: '6px 8px', borderBottom: `1px solid ${BRAND.border}`, color: BRAND.textLight, fontSize: 10 };
const td: React.CSSProperties = { padding: '6px 8px', borderBottom: `1px solid ${BRAND.borderLight}` };
