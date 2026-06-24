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

const PARTICIPATION_COLORS = [BRAND.green, BRAND.red];
const SCORE_COLORS = [BRAND.red, '#f97316', BRAND.yellow, BRAND.blue, BRAND.green];

export interface QuizChartsProps {
  weeklyTrend: ChartDataPoint[];
  quizScoreDistribution: ChartDataPoint[];
  quizByCohort: ChartDataPoint[];
  quizParticipation: ChartDataPoint[];
  loading?: boolean;
  error?: string | null;
}

export function QuizTrendChart({ data }: { data: ChartDataPoint[] }) {
  return (
    <ChartCard title="Quiz Average Trend" subtitle="Weekly average from quiz results">
      <ResponsiveContainer width="100%" height={CHART_HEIGHT.default}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={BRAND.borderLight} />
          <XAxis dataKey="name" stroke={BRAND.textLight} fontSize={12} />
          <YAxis stroke={BRAND.textLight} fontSize={12} domain={[0, 100]} />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="quiz"
            stroke={BRAND.green}
            strokeWidth={3}
            dot={{ r: 4, fill: BRAND.yellow, stroke: BRAND.green }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function QuizScoreDistribution({ data }: { data: ChartDataPoint[] }) {
  return (
    <ChartCard title="Quiz Score Distribution" subtitle="Students grouped by quiz average bucket">
      <ResponsiveContainer width="100%" height={CHART_HEIGHT.default}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={BRAND.borderLight} />
          <XAxis dataKey="name" stroke={BRAND.textLight} fontSize={12} />
          <YAxis stroke={BRAND.textLight} fontSize={12} />
          <Tooltip />
          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={SCORE_COLORS[i % SCORE_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function QuizByCohort({ data }: { data: ChartDataPoint[] }) {
  return (
    <ChartCard title="Quiz Average by Cohort" subtitle="Average quiz score per cohort">
      <ResponsiveContainer width="100%" height={CHART_HEIGHT.default}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={BRAND.borderLight} />
          <XAxis dataKey="name" stroke={BRAND.textLight} fontSize={12} />
          <YAxis stroke={BRAND.textLight} fontSize={12} domain={[0, 100]} />
          <Tooltip />
          <Legend />
          <Bar dataKey="current" name="Average" fill={BRAND.navy} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function QuizParticipation({ data }: { data: ChartDataPoint[] }) {
  return (
    <ChartCard title="Quiz Participation" subtitle="Students with at least one quiz attempt">
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
              <Cell key={i} fill={PARTICIPATION_COLORS[i % PARTICIPATION_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export default function QuizCharts(props: QuizChartsProps) {
  const empty = !props.quizScoreDistribution.length && !props.quizParticipation.length;
  return (
    <AnalyticsShell loading={props.loading} error={props.error} empty={empty}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 16,
        }}
      >
        <QuizTrendChart data={props.weeklyTrend} />
        <QuizScoreDistribution data={props.quizScoreDistribution} />
        <QuizByCohort data={props.quizByCohort} />
        <QuizParticipation data={props.quizParticipation} />
      </div>
    </AnalyticsShell>
  );
}
