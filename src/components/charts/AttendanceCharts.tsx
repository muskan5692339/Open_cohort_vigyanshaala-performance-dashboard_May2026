import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar,
} from 'recharts';
import { BRAND } from '../../types/adminTypes';
import type { ChartDataPoint } from '../../types/adminTypes';
import ChartCard, { CHART_HEIGHT } from './ChartCard';
import AnalyticsShell from '../shared/AnalyticsShell';

const DISTRIBUTION_COLORS = [BRAND.red, BRAND.yellow, BRAND.blue, BRAND.green];

export interface AttendanceChartsProps {
  attendanceDistribution: ChartDataPoint[];
  weeklyTrend: ChartDataPoint[];
  monthlyTrend: ChartDataPoint[];
  attendanceByCollege: ChartDataPoint[];
  attendanceByCohort: ChartDataPoint[];
  loading?: boolean;
  error?: string | null;
}

export function AttendanceDistributionChart({ data }: { data: ChartDataPoint[] }) {
  return (
    <ChartCard title="Attendance Distribution" subtitle="Students grouped by attendance range">
      <ResponsiveContainer width="100%" height={CHART_HEIGHT.default}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={50}
            outerRadius={90}
            paddingAngle={2}
            label={({ name, value }) => `${name}: ${value}`}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={DISTRIBUTION_COLORS[i % DISTRIBUTION_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function WeeklyAttendanceTrend({ data }: { data: ChartDataPoint[] }) {
  return (
    <ChartCard title="Weekly Attendance Trend" subtitle="Program-wide average from session data">
      <ResponsiveContainer width="100%" height={CHART_HEIGHT.default}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={BRAND.borderLight} />
          <XAxis dataKey="name" stroke={BRAND.textLight} fontSize={12} />
          <YAxis stroke={BRAND.textLight} fontSize={12} domain={[0, 100]} />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="attendance"
            stroke={BRAND.navy}
            strokeWidth={3}
            dot={{ r: 4, fill: BRAND.yellow, stroke: BRAND.navy }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function MonthlyAttendanceTrend({ data }: { data: ChartDataPoint[] }) {
  return (
    <ChartCard title="Monthly Attendance Trend" subtitle="Last 6 months from session dates">
      <ResponsiveContainer width="100%" height={CHART_HEIGHT.default}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={BRAND.borderLight} />
          <XAxis dataKey="name" stroke={BRAND.textLight} fontSize={12} />
          <YAxis stroke={BRAND.textLight} fontSize={12} domain={[0, 100]} />
          <Tooltip />
          <Bar dataKey="attendance" fill={BRAND.navy} radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function AttendanceByCollege({ data }: { data: ChartDataPoint[] }) {
  return (
    <ChartCard title="Attendance by College" subtitle="Average attendance per partner college" height={300}>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT.default}>
        <BarChart data={data} layout="vertical" margin={{ left: 80 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={BRAND.borderLight} />
          <XAxis type="number" stroke={BRAND.textLight} fontSize={12} domain={[0, 100]} />
          <YAxis dataKey="name" type="category" stroke={BRAND.textLight} fontSize={11} width={100} />
          <Tooltip />
          <Bar dataKey="value" fill={BRAND.green} radius={[0, 6, 6, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function AttendanceByCohort({ data }: { data: ChartDataPoint[] }) {
  return (
    <ChartCard title="Attendance by Cohort" subtitle="Current week vs previous week">
      <ResponsiveContainer width="100%" height={CHART_HEIGHT.default}>
        <BarChart data={data}>
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
  );
}

export default function AttendanceCharts({
  attendanceDistribution,
  weeklyTrend,
  monthlyTrend,
  attendanceByCollege,
  attendanceByCohort,
  loading,
  error,
}: AttendanceChartsProps) {
  const empty = !attendanceDistribution.length && !weeklyTrend.length;
  return (
    <AnalyticsShell loading={loading} error={error} empty={empty}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 16,
        }}
      >
        <AttendanceDistributionChart data={attendanceDistribution} />
        <WeeklyAttendanceTrend data={weeklyTrend} />
        <MonthlyAttendanceTrend data={monthlyTrend} />
        <AttendanceByCollege data={attendanceByCollege} />
        <AttendanceByCohort data={attendanceByCohort} />
      </div>
    </AnalyticsShell>
  );
}
