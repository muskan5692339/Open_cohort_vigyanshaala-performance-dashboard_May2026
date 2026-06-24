import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { BRAND } from '../../../types/adminTypes';
import type { ChartDataPoint, CohortMetric } from '../../../types/adminTypes';
import ChartCard from '../../charts/ChartCard';
import AnalyticsShell from '../../shared/AnalyticsShell';

const LINE_COLORS = [BRAND.navy, BRAND.green, BRAND.yellowDark, BRAND.red, '#8b5cf6', '#06b6d4'];

export interface CohortComparisonProps {
  attendanceByCohort: ChartDataPoint[];
  assignmentByCohort: ChartDataPoint[];
  cohortQuizTrend: ChartDataPoint[];
  cohortMetricsTable: CohortMetric[];
  loading?: boolean;
  error?: string | null;
}

export default function CohortComparison({
  attendanceByCohort,
  assignmentByCohort,
  cohortQuizTrend,
  cohortMetricsTable,
  loading,
  error,
}: CohortComparisonProps) {
  const cohortLineKeys =
    cohortQuizTrend.length > 0
      ? Object.keys(cohortQuizTrend[0]).filter(k => k !== 'name' && k !== 'value')
      : [];

  return (
    <AnalyticsShell loading={loading} error={error} empty={!cohortMetricsTable.length}>
      <div style={{ display: 'grid', gap: 16 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
            gap: 16,
          }}
        >
          <ChartCard title="Attendance by Cohort" subtitle="Current week vs previous week">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={attendanceByCohort}>
                <CartesianGrid strokeDasharray="3 3" stroke={BRAND.borderLight} />
                <XAxis dataKey="name" stroke={BRAND.textLight} fontSize={12} />
                <YAxis stroke={BRAND.textLight} fontSize={12} domain={[0, 100]} />
                <Tooltip />
                <Legend />
                <Bar dataKey="current" name="Current" fill={BRAND.navy} radius={[4, 4, 0, 0]} />
                <Bar dataKey="previous" name="Previous" fill={BRAND.yellow} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Assignment Completion by Cohort" subtitle="Current week vs previous week">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={assignmentByCohort}>
                <CartesianGrid strokeDasharray="3 3" stroke={BRAND.borderLight} />
                <XAxis dataKey="name" stroke={BRAND.textLight} fontSize={12} />
                <YAxis stroke={BRAND.textLight} fontSize={12} domain={[0, 100]} />
                <Tooltip />
                <Legend />
                <Bar dataKey="current" name="Current" fill={BRAND.green} radius={[4, 4, 0, 0]} />
                <Bar dataKey="previous" name="Previous" fill={BRAND.yellow} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {cohortLineKeys.length > 0 && (
          <ChartCard title="Quiz Average by Cohort" subtitle="Weekly cohort quiz averages" height={320}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cohortQuizTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke={BRAND.borderLight} />
                <XAxis dataKey="name" stroke={BRAND.textLight} fontSize={12} />
                <YAxis stroke={BRAND.textLight} fontSize={12} domain={[0, 100]} />
                <Tooltip />
                <Legend />
                {cohortLineKeys.map((cohort, i) => (
                  <Line
                    key={cohort}
                    type="monotone"
                    dataKey={cohort}
                    stroke={LINE_COLORS[i % LINE_COLORS.length]}
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        <div
          style={{
            background: BRAND.card,
            border: `1px solid ${BRAND.border}`,
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${BRAND.border}` }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: BRAND.text }}>
              Cohort Metrics Side by Side
            </div>
            <div style={{ fontSize: 12, color: BRAND.textLight, marginTop: 2 }}>
              All key metrics by batch from live Supabase data.
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ background: BRAND.bg }}>
                <tr>
                  {[
                    'Cohort',
                    'Students',
                    'Attendance %',
                    'Assignment %',
                    'Quiz Avg',
                    'Engagement',
                    'At Risk',
                    'Top Performers',
                  ].map(h => (
                    <th
                      key={h}
                      style={{
                        padding: '12px 14px',
                        textAlign: 'left',
                        fontSize: 11,
                        color: BRAND.textLight,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cohortMetricsTable.map(c => (
                  <tr key={c.cohort} style={{ borderBottom: `1px solid ${BRAND.borderLight}` }}>
                    <td style={{ padding: '12px 14px', color: BRAND.text, fontWeight: 700 }}>
                      {c.cohort}
                    </td>
                    <td style={{ padding: '12px 14px', color: BRAND.text }}>{c.totalStudents}</td>
                    <td style={{ padding: '12px 14px', color: BRAND.text }}>{c.attendance}%</td>
                    <td style={{ padding: '12px 14px', color: BRAND.text }}>
                      {c.assignmentCompletion}%
                    </td>
                    <td style={{ padding: '12px 14px', color: BRAND.text }}>{c.quizAverage}</td>
                    <td style={{ padding: '12px 14px', color: BRAND.text }}>{c.engagementScore}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <span
                        style={{
                          background: BRAND.redLight,
                          color: BRAND.red,
                          padding: '3px 10px',
                          borderRadius: 999,
                          fontWeight: 700,
                          fontSize: 11,
                        }}
                      >
                        {c.atRisk}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span
                        style={{
                          background: BRAND.greenLight,
                          color: BRAND.greenDark,
                          padding: '3px 10px',
                          borderRadius: 999,
                          fontWeight: 700,
                          fontSize: 11,
                        }}
                      >
                        {c.topPerformers}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AnalyticsShell>
  );
}
