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

const STATUS_COLORS = [BRAND.green, BRAND.yellow, BRAND.red];

export interface AssignmentChartsProps {
  assignmentStatusDistribution: ChartDataPoint[];
  weeklyTrend: ChartDataPoint[];
  assignmentByCohort: ChartDataPoint[];
  assignmentByCollege: ChartDataPoint[];
  loading?: boolean;
  error?: string | null;
}

export function AssignmentCompletionChart({ data }: { data: ChartDataPoint[] }) {
  return (
    <ChartCard title="Assignment Status" subtitle="All submission records in Supabase">
      <ResponsiveContainer width="100%" height={CHART_HEIGHT.default}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={60}
            outerRadius={90}
            paddingAngle={2}
            label={({ name, value }) => `${name}: ${value}`}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={STATUS_COLORS[i % STATUS_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function AssignmentTrend({ data }: { data: ChartDataPoint[] }) {
  return (
    <ChartCard title="Assignment Completion Trend" subtitle="Weekly submissions vs total records">
      <ResponsiveContainer width="100%" height={CHART_HEIGHT.default}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={BRAND.borderLight} />
          <XAxis dataKey="name" stroke={BRAND.textLight} fontSize={12} />
          <YAxis stroke={BRAND.textLight} fontSize={12} domain={[0, 100]} />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="assignment"
            stroke={BRAND.yellowDark}
            strokeWidth={3}
            dot={{ r: 4, fill: BRAND.yellow, stroke: BRAND.navy }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function AssignmentByCohort({ data }: { data: ChartDataPoint[] }) {
  return (
    <ChartCard title="Assignment Completion by Cohort" subtitle="Average % completed per cohort">
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

export function AssignmentByCollege({ data }: { data: ChartDataPoint[] }) {
  return (
    <ChartCard title="Assignment Completion by College" subtitle="Average % per college" height={300}>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT.default}>
        <BarChart data={data} layout="vertical" margin={{ left: 80 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={BRAND.borderLight} />
          <XAxis type="number" stroke={BRAND.textLight} fontSize={12} domain={[0, 100]} />
          <YAxis dataKey="name" type="category" stroke={BRAND.textLight} fontSize={11} width={100} />
          <Tooltip />
          <Bar dataKey="value" fill={BRAND.yellow} radius={[0, 6, 6, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export default function AssignmentCharts(props: AssignmentChartsProps) {
  const empty =
    !props.assignmentStatusDistribution.length &&
    !props.weeklyTrend.length &&
    !props.assignmentByCohort.length;
  return (
    <AnalyticsShell loading={props.loading} error={props.error} empty={empty}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 16,
        }}
      >
        <AssignmentCompletionChart data={props.assignmentStatusDistribution} />
        <AssignmentTrend data={props.weeklyTrend} />
        <AssignmentByCohort data={props.assignmentByCohort} />
        <AssignmentByCollege data={props.assignmentByCollege} />
      </div>
    </AnalyticsShell>
  );
}
