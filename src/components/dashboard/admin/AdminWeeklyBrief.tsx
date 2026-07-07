import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ColumnMapping } from '../../../types/dynamicSchema';
import type { WeeklyInterventionStats } from '../../../types/intelligenceTypes';
import { BRAND } from '../../../types/adminTypes';
import { listUploadSnapshots } from '../../../services/uploadSnapshotStore';
import {
  buildSnapshotChartSeries,
  computeWeeklyUploadMetrics,
  findInterventionColumn,
  formatUploadLabel,
  pctChange,
  type SnapshotChartPoint,
} from '../../../services/weeklyAdminMetrics';

interface Props {
  rows: Record<string, string>[];
  headers: string[];
  mapping: ColumnMapping | undefined;
  fileName: string | null;
  publishedAt: string | null;
}

type ValueMode = 'absolute' | 'improvement';
type TimelineMode = 'each-upload' | 'weekly';

function StatCard({ label, value, hint, delta }: { label: string; value: string | number; hint?: string; delta?: string | null }) {
  return (
    <div style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, color: BRAND.textLight, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: BRAND.navy, marginTop: 4 }}>{value}</div>
      {delta && <div style={{ fontSize: 11, fontWeight: 700, color: delta.startsWith('+') ? BRAND.green : BRAND.red, marginTop: 4 }}>{delta} vs last upload</div>}
      {hint && <div style={{ fontSize: 11, color: BRAND.textMuted, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function TrendChart({
  title,
  hint,
  data,
  valueMode,
  valueKey,
  pctKey,
  valueSuffix,
  color,
}: {
  title: string;
  hint: string;
  data: SnapshotChartPoint[];
  valueMode: ValueMode;
  valueKey: keyof SnapshotChartPoint;
  pctKey: keyof SnapshotChartPoint;
  valueSuffix: string;
  color: string;
}) {
  const isImprovement = valueMode === 'improvement';
  const chartKey = isImprovement ? pctKey : valueKey;
  const name = isImprovement ? '% change' : 'Value';

  return (
    <div style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: BRAND.textLight, marginBottom: 12 }}>{hint}</div>
      <div style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BRAND.border} />
            <XAxis dataKey="label" fontSize={10} stroke={BRAND.textLight} />
            <YAxis
              fontSize={11}
              stroke={BRAND.textLight}
              allowDecimals
              tickFormatter={v => (isImprovement ? `${v}%` : String(v))}
            />
            <Tooltip
              labelFormatter={(_, payload) => payload?.[0]?.payload?.fullLabel ?? ''}
              formatter={(value) => [
                isImprovement ? `${Number(value ?? 0)}%` : `${Number(value ?? 0)}${valueSuffix}`,
                name,
              ]}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey={chartKey as string}
              name={name}
              stroke={color}
              strokeWidth={2.5}
              dot
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function AdminWeeklyBrief({ rows, headers, mapping, fileName, publishedAt }: Props) {
  const allSnapshots = useMemo(() => listUploadSnapshots(), [rows.length, fileName, publishedAt]);
  const [interventionFilter, setInterventionFilter] = useState<string>('all');
  const [valueMode, setValueMode] = useState<ValueMode>('absolute');
  const [timelineMode, setTimelineMode] = useState<TimelineMode>('each-upload');

  const current = useMemo(
    () => computeWeeklyUploadMetrics(rows, headers, mapping),
    [rows, headers, mapping],
  );

  const interventionCol = findInterventionColumn(headers, mapping);
  const groups = current.interventionBreakdown;
  const filteredGroup = interventionFilter === 'all' ? null : groups.find(g => g.group === interventionFilter);

  const chartData = useMemo(
    () => buildSnapshotChartSeries(allSnapshots, interventionFilter, timelineMode === 'weekly'),
    [allSnapshots, interventionFilter, timelineMode],
  );

  const prevSnap = allSnapshots.length > 1 ? allSnapshots[1] : null;
  const prevGroup = prevSnap && interventionFilter !== 'all'
    ? prevSnap.metrics.interventionBreakdown?.find(g => g.group === interventionFilter)
    : null;

  const display = {
    students: filteredGroup?.studentCount ?? rows.length,
    attendance: filteredGroup?.avgAttendance ?? current.avgAttendance,
    programHours: filteredGroup?.avgProgramHours ?? current.avgProgramHours,
    quiz: filteredGroup?.avgQuizScore ?? current.avgQuizScore,
    submitted: filteredGroup?.assignmentsSubmitted ?? current.assignmentsSubmitted,
    reviewed: filteredGroup?.assignmentsReviewed ?? current.assignmentsReviewed,
    accepted: filteredGroup?.assignmentsAccepted ?? current.assignmentsAccepted,
    pending: filteredGroup?.assignmentsPending ?? current.assignmentsPending,
  };

  const prevDisplay = prevSnap ? {
    attendance: prevGroup?.avgAttendance ?? prevSnap.metrics.avgAttendance ?? 0,
    programHours: prevGroup?.avgProgramHours ?? prevSnap.metrics.avgProgramHours ?? 0,
    quiz: prevGroup?.avgQuizScore ?? prevSnap.metrics.avgQuizScore ?? prevSnap.metrics.avgAssessment ?? 0,
    submitted: prevGroup?.assignmentsSubmitted ?? prevSnap.metrics.assignmentsSubmitted ?? 0,
    reviewed: prevGroup?.assignmentsReviewed ?? prevSnap.metrics.assignmentsReviewed ?? 0,
  } : null;

  const fmtDelta = (cur: number, prev: number | undefined) => {
    const p = pctChange(cur, prev ?? null);
    if (p == null) return null;
    return `${p > 0 ? '+' : ''}${p}%`;
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ background: '#f0f4ff', border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: '12px 16px', fontSize: 13 }}>
        <strong>Weekly change tracker</strong> — each time you update Data Sources, metrics are recorded with timestamp for line graphs.
        {publishedAt && (
          <span style={{ color: BRAND.textLight }}> · Latest: {formatUploadLabel(publishedAt, fileName ?? undefined)}</span>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <label style={{ fontSize: 12, fontWeight: 600 }}>
          Student category
          <select
            value={interventionFilter}
            onChange={e => setInterventionFilter(e.target.value)}
            style={{ marginLeft: 8, padding: '6px 10px', borderRadius: 8, border: `1px solid ${BRAND.border}`, fontSize: 13 }}
          >
            <option value="all">All categories</option>
            {groups.map((g: WeeklyInterventionStats) => (
              <option key={g.group} value={g.group}>{g.group} ({g.studentCount})</option>
            ))}
          </select>
        </label>

        <label style={{ fontSize: 12, fontWeight: 600 }}>
          Timeline
          <select
            value={timelineMode}
            onChange={e => setTimelineMode(e.target.value as TimelineMode)}
            style={{ marginLeft: 8, padding: '6px 10px', borderRadius: 8, border: `1px solid ${BRAND.border}`, fontSize: 13 }}
          >
            <option value="each-upload">Each data upload</option>
            <option value="weekly">Weekly view (latest per week)</option>
          </select>
        </label>

        <label style={{ fontSize: 12, fontWeight: 600 }}>
          Chart values
          <select
            value={valueMode}
            onChange={e => setValueMode(e.target.value as ValueMode)}
            style={{ marginLeft: 8, padding: '6px 10px', borderRadius: 8, border: `1px solid ${BRAND.border}`, fontSize: 13 }}
          >
            <option value="absolute">Actual values</option>
            <option value="improvement">% improvement vs previous</option>
          </select>
        </label>

        {interventionCol && (
          <span style={{ fontSize: 11, color: BRAND.textLight }}>Category column: {interventionCol}</span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
        <StatCard label="Students" value={display.students} hint="In selected category" />
        <StatCard label="Avg attendance" value={`${display.attendance}%`} delta={fmtDelta(display.attendance, prevDisplay?.attendance)} />
        <StatCard label="Avg program hrs" value={display.programHours} delta={fmtDelta(display.programHours, prevDisplay?.programHours)} />
        <StatCard label="Avg quiz score" value={`${display.quiz}%`} delta={fmtDelta(display.quiz, prevDisplay?.quiz)} />
        <StatCard label="Submitted" value={display.submitted} delta={fmtDelta(display.submitted, prevDisplay?.submitted)} />
        <StatCard label="Reviewed" value={display.reviewed} delta={fmtDelta(display.reviewed, prevDisplay?.reviewed)} />
      </div>

      {chartData.length > 1 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
          <TrendChart
            title="Attendance change"
            hint="Average attendance % after each upload"
            data={chartData}
            valueMode={valueMode}
            valueKey="attendance"
            pctKey="attendancePct"
            valueSuffix="%"
            color={BRAND.green}
          />
          <TrendChart
            title="Program hours change"
            hint="Average program hours per student"
            data={chartData}
            valueMode={valueMode}
            valueKey="programHours"
            pctKey="programHoursPct"
            valueSuffix=" hrs"
            color={BRAND.navy}
          />
          <TrendChart
            title="Quiz score change"
            hint="Average quiz score % across quiz columns"
            data={chartData}
            valueMode={valueMode}
            valueKey="quizScore"
            pctKey="quizScorePct"
            valueSuffix="%"
            color={BRAND.blue}
          />
          <TrendChart
            title="Assignments submitted"
            hint="Total assignment slots marked submitted"
            data={chartData}
            valueMode={valueMode}
            valueKey="submitted"
            pctKey="submittedPct"
            valueSuffix=""
            color="#d97706"
          />
          <TrendChart
            title="Assignments reviewed"
            hint="Accepted + rejected (facilitator reviewed)"
            data={chartData}
            valueMode={valueMode}
            valueKey="reviewed"
            pctKey="reviewedPct"
            valueSuffix=""
            color={BRAND.yellowDark}
          />
        </div>
      ) : (
        <div style={{ fontSize: 13, color: BRAND.textLight, padding: 12, border: `1px dashed ${BRAND.border}`, borderRadius: 10 }}>
          Upload your workbook in <strong>Data Sources</strong> at least twice to see weekly trend lines and % improvement.
          {allSnapshots.length === 1 && (
            <span> First snapshot recorded at {formatUploadLabel(allSnapshots[0].uploadedAt, allSnapshots[0].fileName)}.</span>
          )}
        </div>
      )}

      <div style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 14, overflowX: 'auto' }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Engagement by student category (this upload)</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 720 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: `2px solid ${BRAND.border}` }}>
              <th style={{ padding: '8px 6px' }}>Category</th>
              <th style={{ padding: '8px 6px' }}>Students</th>
              <th style={{ padding: '8px 6px' }}>Attendance</th>
              <th style={{ padding: '8px 6px' }}>Program hrs</th>
              <th style={{ padding: '8px 6px' }}>Quiz avg</th>
              <th style={{ padding: '8px 6px' }}>Submitted</th>
              <th style={{ padding: '8px 6px' }}>Reviewed</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g: WeeklyInterventionStats) => (
              <tr key={g.group} style={{ borderBottom: `1px solid ${BRAND.borderLight}` }}>
                <td style={{ padding: '8px 6px', fontWeight: 600 }}>{g.group}</td>
                <td style={{ padding: '8px 6px' }}>{g.studentCount}</td>
                <td style={{ padding: '8px 6px' }}>{g.avgAttendance}%</td>
                <td style={{ padding: '8px 6px' }}>{g.avgProgramHours}</td>
                <td style={{ padding: '8px 6px' }}>{g.avgQuizScore}%</td>
                <td style={{ padding: '8px 6px' }}>{g.assignmentsSubmitted}</td>
                <td style={{ padding: '8px 6px' }}>{g.assignmentsReviewed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
