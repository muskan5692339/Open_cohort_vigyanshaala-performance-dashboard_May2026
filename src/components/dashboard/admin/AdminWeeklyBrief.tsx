import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
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
  pctChange,
  type SnapshotChartPoint,
} from '../../../services/weeklyAdminMetrics';
import {
  ACTIVITY_CHART_LEVELS,
  compareTwoWeeks,
  computeWeeklyBreakdown,
  listWeeklyCategoryOptions,
  WEEKLY_CHART_COLORS,
  type WeeklyBreakdownPoint,
} from '../../../services/weeklyBreakdownMetrics';
import { ACTIVITY_COLORS } from '../../../services/programOverviewMetrics';

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

function WeeklyLineChart({
  title,
  hint,
  data,
  lines,
}: {
  title: string;
  hint: string;
  data: WeeklyBreakdownPoint[];
  lines: { key: keyof WeeklyBreakdownPoint; name: string; color: string }[];
}) {
  return (
    <div style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: BRAND.textLight, marginBottom: 12 }}>{hint}</div>
      <div style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BRAND.border} />
            <XAxis dataKey="week" fontSize={11} stroke={BRAND.textLight} />
            <YAxis fontSize={11} stroke={BRAND.textLight} allowDecimals={false} />
            <Tooltip />
            <Legend />
            {lines.map(line => (
              <Line
                key={line.key as string}
                type="monotone"
                dataKey={line.key as string}
                name={line.name}
                stroke={line.color}
                strokeWidth={2.5}
                dot={{ r: 4 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
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

  const [categoryFilter, setCategoryFilter] = useState('all');
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [compareWeekA, setCompareWeekA] = useState('');
  const [compareWeekB, setCompareWeekB] = useState('');

  const categoryOptions = useMemo(
    () => listWeeklyCategoryOptions(rows, headers, mapping),
    [rows, headers, mapping],
  );

  const weeklyBreakdown = useMemo(
    () => computeWeeklyBreakdown(rows, headers, mapping, categoryFilter),
    [rows, headers, mapping, categoryFilter],
  );

  const weekLabels = weeklyBreakdown.map(p => p.week);

  useEffect(() => {
    if (weekLabels.length >= 2 && !compareWeekA) {
      setCompareWeekA(weekLabels[0]);
      setCompareWeekB(weekLabels[weekLabels.length - 1]);
    }
  }, [weekLabels, compareWeekA]);

  const comparison = useMemo(
    () => (compareEnabled && compareWeekA && compareWeekB
      ? compareTwoWeeks(weeklyBreakdown, compareWeekA, compareWeekB)
      : []),
    [compareEnabled, compareWeekA, compareWeekB, weeklyBreakdown],
  );

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

  const categoryLabel = categoryOptions.find(c => c.value === categoryFilter)?.label ?? 'All categories';

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {/* ── WK column breakdown (from Excel headers) ── */}
      <div style={{ background: '#f0f4ff', border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: '12px 16px', fontSize: 13 }}>
        <strong>Weekly program breakdown</strong> — sums columns tagged WK0, WK1, WK2… from your monitoring sheet.
        {publishedAt && (
          <span style={{ color: BRAND.textLight }}> · Data from latest upload{fileName ? `: ${fileName}` : ''}</span>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <label style={{ fontSize: 12, fontWeight: 600 }}>
          Student category
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            style={{ marginLeft: 8, padding: '6px 10px', borderRadius: 8, border: `1px solid ${BRAND.border}`, fontSize: 13, minWidth: 160 }}
          >
            {categoryOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label} ({opt.count})</option>
            ))}
          </select>
        </label>

        <label style={{ fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={compareEnabled}
            onChange={e => setCompareEnabled(e.target.checked)}
          />
          Compare two weeks
        </label>

        {compareEnabled && weekLabels.length >= 2 && (
          <>
            <label style={{ fontSize: 12, fontWeight: 600 }}>
              Week A
              <select
                value={compareWeekA}
                onChange={e => setCompareWeekA(e.target.value)}
                style={{ marginLeft: 8, padding: '6px 10px', borderRadius: 8, border: `1px solid ${BRAND.border}`, fontSize: 13 }}
              >
                {weekLabels.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12, fontWeight: 600 }}>
              Week B
              <select
                value={compareWeekB}
                onChange={e => setCompareWeekB(e.target.value)}
                style={{ marginLeft: 8, padding: '6px 10px', borderRadius: 8, border: `1px solid ${BRAND.border}`, fontSize: 13 }}
              >
                {weekLabels.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </label>
          </>
        )}
      </div>

      {weeklyBreakdown.length === 0 ? (
        <div style={{ fontSize: 13, color: BRAND.textLight, padding: 16, border: `1px dashed ${BRAND.border}`, borderRadius: 10 }}>
          No WK-tagged columns found. Add session columns like <code>WK0_SUK_Saturday</code>, <code>WK1_WS_Monday</code>, or <code>Pre-recorded_WK3_V1</code> in your Excel sheet.
        </div>
      ) : (
        <>
          {compareEnabled && comparison.length > 0 && (
            <div style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
                {compareWeekA} vs {compareWeekB} — {categoryLabel}
              </div>
              <div style={{ fontSize: 12, color: BRAND.textLight, marginBottom: 12 }}>Side-by-side comparison for the selected category</div>
              <div style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={comparison} margin={{ top: 8, right: 12, left: 0, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={BRAND.border} />
                    <XAxis dataKey="metric" fontSize={10} stroke={BRAND.textLight} angle={-20} textAnchor="end" height={60} />
                    <YAxis fontSize={11} stroke={BRAND.textLight} allowDecimals={false} />
                    <Tooltip formatter={(v, name) => [v, name === compareWeekA ? compareWeekA : compareWeekB]} />
                    <Legend />
                    <Bar dataKey="weekA" name={compareWeekA} fill={BRAND.navy} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="weekB" name={compareWeekB} fill={BRAND.blue} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
            <WeeklyLineChart
              title="Weekly attendance"
              hint={`Students with session hours &gt; 0 · ${categoryLabel}`}
              data={weeklyBreakdown}
              lines={[{ key: 'attendanceCount', name: 'Students attended', color: WEEKLY_CHART_COLORS.attendance }]}
            />
            <WeeklyLineChart
              title="Assignments submitted"
              hint="All statuses except no-submission"
              data={weeklyBreakdown}
              lines={[{ key: 'assignmentsSubmitted', name: 'Submitted', color: WEEKLY_CHART_COLORS.submitted }]}
            />
            <WeeklyLineChart
              title="Assignments accepted"
              hint="Accepted out of submitted slots"
              data={weeklyBreakdown}
              lines={[{ key: 'assignmentsAccepted', name: 'Accepted', color: WEEKLY_CHART_COLORS.accepted }]}
            />
            <WeeklyLineChart
              title="Quiz submissions"
              hint="Non-empty quiz cells per week"
              data={weeklyBreakdown}
              lines={[{ key: 'quizSubmissions', name: 'Quiz submissions', color: WEEKLY_CHART_COLORS.quiz }]}
            />
          </div>

          <WeeklyLineChart
            title="Activity levels by week"
            hint="Highly Active / Active / Partially Active — students who attended that week (from current status column)"
            data={weeklyBreakdown}
            lines={[
              { key: 'highlyActive', name: 'Highly Active', color: ACTIVITY_COLORS['Highly Active'] },
              { key: 'active', name: 'Active', color: ACTIVITY_COLORS.Active },
              { key: 'partiallyActive', name: 'Partially Active', color: ACTIVITY_COLORS['Partially Active'] },
            ]}
          />

          <div style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 14, overflowX: 'auto' }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Weekly breakdown table — {categoryLabel}</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 720 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: `2px solid ${BRAND.border}` }}>
                  {['Week', 'Attended', 'Submitted', 'Accepted', 'Quiz', ...ACTIVITY_CHART_LEVELS].map(h => (
                    <th key={h} style={{ padding: '8px 6px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weeklyBreakdown.map(w => (
                  <tr key={w.week} style={{ borderBottom: `1px solid ${BRAND.borderLight}` }}>
                    <td style={{ padding: '8px 6px', fontWeight: 700 }}>{w.week}</td>
                    <td style={{ padding: '8px 6px' }}>{w.attendanceCount}</td>
                    <td style={{ padding: '8px 6px' }}>{w.assignmentsSubmitted}</td>
                    <td style={{ padding: '8px 6px' }}>{w.assignmentsAccepted}</td>
                    <td style={{ padding: '8px 6px' }}>{w.quizSubmissions}</td>
                    <td style={{ padding: '8px 6px', color: ACTIVITY_COLORS['Highly Active'] }}>{w.highlyActive}</td>
                    <td style={{ padding: '8px 6px', color: ACTIVITY_COLORS.Active }}>{w.active}</td>
                    <td style={{ padding: '8px 6px', color: ACTIVITY_COLORS['Partially Active'] }}>{w.partiallyActive}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Upload-over-time tracker (existing) ── */}
      <div style={{ borderTop: `2px solid ${BRAND.border}`, paddingTop: 16 }}>
        <div style={{ background: '#fafafa', border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: '12px 16px', fontSize: 13 }}>
          <strong>Upload change tracker</strong> — trend lines when you re-upload Data Sources over time.
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginTop: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 600 }}>
            Snapshot category
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

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginTop: 12 }}>
          <StatCard label="Students" value={display.students} hint="In selected category" />
          <StatCard label="Avg attendance" value={`${display.attendance}%`} delta={fmtDelta(display.attendance, prevDisplay?.attendance)} />
          <StatCard label="Avg program hrs" value={display.programHours} delta={fmtDelta(display.programHours, prevDisplay?.programHours)} />
          <StatCard label="Avg quiz score" value={`${display.quiz}%`} delta={fmtDelta(display.quiz, prevDisplay?.quiz)} />
          <StatCard label="Submitted" value={display.submitted} delta={fmtDelta(display.submitted, prevDisplay?.submitted)} />
          <StatCard label="Reviewed" value={display.reviewed} delta={fmtDelta(display.reviewed, prevDisplay?.reviewed)} />
        </div>

        {chartData.length > 1 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, marginTop: 12 }}>
            <TrendChart title="Attendance change" hint="Average attendance % after each upload" data={chartData} valueMode={valueMode} valueKey="attendance" pctKey="attendancePct" valueSuffix="%" color={BRAND.green} />
            <TrendChart title="Program hours change" hint="Average program hours per student" data={chartData} valueMode={valueMode} valueKey="programHours" pctKey="programHoursPct" valueSuffix=" hrs" color={BRAND.navy} />
            <TrendChart title="Quiz score change" hint="Average quiz score % across quiz columns" data={chartData} valueMode={valueMode} valueKey="quizScore" pctKey="quizScorePct" valueSuffix="%" color={BRAND.blue} />
            <TrendChart title="Assignments submitted" hint="Total assignment slots marked submitted" data={chartData} valueMode={valueMode} valueKey="submitted" pctKey="submittedPct" valueSuffix="" color="#d97706" />
            <TrendChart title="Assignments reviewed" hint="Accepted + rejected (facilitator reviewed)" data={chartData} valueMode={valueMode} valueKey="reviewed" pctKey="reviewedPct" valueSuffix="" color={BRAND.yellowDark} />
          </div>
        ) : (
          <div style={{ fontSize: 13, color: BRAND.textLight, padding: 12, border: `1px dashed ${BRAND.border}`, borderRadius: 10, marginTop: 12 }}>
            Upload your workbook in <strong>Data Sources</strong> at least twice to see upload trend lines.
          </div>
        )}

        <div style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 14, overflowX: 'auto', marginTop: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Engagement by student category (this upload)</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 720 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: `2px solid ${BRAND.border}` }}>
                {['Category', 'Students', 'Attendance', 'Program hrs', 'Quiz avg', 'Submitted', 'Reviewed'].map(h => (
                  <th key={h} style={{ padding: '8px 6px' }}>{h}</th>
                ))}
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
    </div>
  );
}
