import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { BRAND } from '../../types/adminTypes';
import type { Student } from '../../types/adminTypes';

const CATEGORY_COLORS: Record<string, string> = {
  'Excellent':       '#16a34a',
  'Good':            '#3b82f6',
  'Needs Attention': '#f59e0b',
  'At Risk':         '#ef4444',
};

const CERT_COLORS = ['#16a34a', '#9ca3af'];

interface Props {
  students: Student[];
}

function categoryData(students: Student[]) {
  const counts: Record<string, number> = {
    Excellent: 0, Good: 0, 'Needs Attention': 0, 'At Risk': 0,
  };
  for (const s of students) counts[s.riskCategory] = (counts[s.riskCategory] ?? 0) + 1;
  return Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }));
}

function certData(students: Student[]) {
  const sent  = students.filter(s => s.certificateStatus?.toLowerCase().includes('sent')).length;
  const other = students.length - sent;
  return [
    { name: 'Certificate Sent', value: sent },
    { name: 'Not Sent',         value: other },
  ].filter(d => d.value > 0);
}

const CustomLabel = ({ cx, cy, midAngle, outerRadius, value, percent }: any) => {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const x = cx + (outerRadius + 18) * Math.cos(-midAngle * RADIAN);
  const y = cy + (outerRadius + 18) * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={600} fill="#374151">
      {value}
    </text>
  );
};

export default function StudentCategoryChart({ students }: Props) {
  const hasCerts = students.some(s => s.certificateStatus);
  const catData  = categoryData(students);
  const certsData = certData(students);

  if (!students.length) return null;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: hasCerts ? 'repeat(2, minmax(0, 1fr))' : '1fr',
        gap: 16,
        width: '100%',
      }}
    >
      {/* Category distribution */}
      <div
        style={{
          background: BRAND.card,
          border: `1px solid ${BRAND.border}`,
          borderRadius: 12,
          padding: '20px 24px',
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: BRAND.text, marginBottom: 4 }}>
          Student Engagement Categories
        </div>
        <div style={{ fontSize: 12, color: BRAND.textLight, marginBottom: 16 }}>
          Based on attendance (40%) + assignment completion (30%) + quiz score (30%)
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={catData}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={88}
              dataKey="value"
              labelLine={false}
              label={<CustomLabel />}
            >
              {catData.map(entry => (
                <Cell key={entry.name} fill={CATEGORY_COLORS[entry.name] ?? '#6b7280'} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, name) => [`${Number(value)} students`, String(name)]}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${BRAND.border}` }}
            />
            <Legend
              formatter={(value) => (
                <span style={{ fontSize: 12, color: BRAND.text }}>{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>

        {/* Legend row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px 16px', marginTop: 8 }}>
          {catData.map(d => (
            <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: CATEGORY_COLORS[d.name], flexShrink: 0 }} />
              <span style={{ color: BRAND.textLight }}>{d.name}</span>
              <span style={{ fontWeight: 700, color: BRAND.text, marginLeft: 'auto' }}>{d.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Certificate status — shown only when data has this field */}
      {hasCerts && (
        <div
          style={{
            background: BRAND.card,
            border: `1px solid ${BRAND.border}`,
            borderRadius: 12,
            padding: '20px 24px',
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, color: BRAND.text, marginBottom: 4 }}>
            Certificate Status
          </div>
          <div style={{ fontSize: 12, color: BRAND.textLight, marginBottom: 16 }}>
            Distribution of certificate issuance across the cohort
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={certsData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={88}
                dataKey="value"
                labelLine={false}
                label={<CustomLabel />}
              >
                {certsData.map((entry, i) => (
                  <Cell key={entry.name} fill={CERT_COLORS[i % CERT_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name) => [`${Number(value)} students`, String(name)]}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${BRAND.border}` }}
              />
              <Legend
                formatter={(value) => (
                  <span style={{ fontSize: 12, color: BRAND.text }}>{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px 16px', marginTop: 8 }}>
            {certsData.map((d, i) => (
              <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: CERT_COLORS[i], flexShrink: 0 }} />
                <span style={{ color: BRAND.textLight }}>{d.name}</span>
                <span style={{ fontWeight: 700, color: BRAND.text, marginLeft: 'auto' }}>{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
