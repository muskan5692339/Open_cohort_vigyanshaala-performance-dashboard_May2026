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
  compareSnapshotUpdates,
  computeWeeklyUploadMetrics,
  formatUploadLabel,
  type SnapshotChartPoint,
} from '../../../services/weeklyAdminMetrics';
import {
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

type TimelineMode = 'each-upload' | 'weekly';

function TimestampLineChart({
  title,
  hint,
  data,
  lines,
}: {
  title: string;
  hint: string;
  data: SnapshotChartPoint[];
  lines: { key: keyof SnapshotChartPoint; name: string; color: string }[];
}) {
  return (
    <div style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: BRAND.textLight, marginBottom: 12 }}>{hint}</div>
      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 48 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BRAND.border} />
            <XAxis dataKey="label" fontSize={10} stroke={BRAND.textLight} angle={-30} textAnchor="end" height={56} />
            <YAxis fontSize={11} stroke={BRAND.textLight} allowDecimals={false} />
            <Tooltip labelFormatter={(_, payload) => payload?.[0]?.payload?.fullLabel ?? ''} />
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

export default function AdminWeeklyBrief({ rows, headers, mapping, fileName, publishedAt }: Props) {
  const allSnapshots = useMemo(
    () => [...listUploadSnapshots()].sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt)),
    [rows.length, fileName, publishedAt],
  );
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [timelineMode, setTimelineMode] = useState<TimelineMode>('each-upload');
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [compareSnapA, setCompareSnapA] = useState('');
  const [compareSnapB, setCompareSnapB] = useState('');

  const categoryOptions = useMemo(
    () => listWeeklyCategoryOptions(rows, headers, mapping),
    [rows, headers, mapping],
  );

  const snapshotChartData = useMemo(
    () => buildSnapshotChartSeries(allSnapshots, categoryFilter, timelineMode === 'weekly'),
    [allSnapshots, categoryFilter, timelineMode],
  );

  useEffect(() => {
    if (allSnapshots.length >= 2 && !compareSnapA) {
      setCompareSnapA(allSnapshots[allSnapshots.length - 2].id);
      setCompareSnapB(allSnapshots[allSnapshots.length - 1].id);
    }
  }, [allSnapshots, compareSnapA]);

  const snapshotComparison = useMemo(
    () => (compareEnabled && compareSnapA && compareSnapB
      ? compareSnapshotUpdates(allSnapshots, compareSnapA, compareSnapB, categoryFilter)
      : []),
    [compareEnabled, compareSnapA, compareSnapB, allSnapshots, categoryFilter],
  );

  const weeklyBreakdown = useMemo(
    () => computeWeeklyBreakdown(rows, headers, mapping, categoryFilter),
    [rows, headers, mapping, categoryFilter],
  );

  const [wkCompareEnabled, setWkCompareEnabled] = useState(false);
  const [compareWeekA, setCompareWeekA] = useState('');
  const [compareWeekB, setCompareWeekB] = useState('');
  const weekLabels = weeklyBreakdown.map(p => p.week);

  useEffect(() => {
    if (weekLabels.length >= 2 && !compareWeekA) {
      setCompareWeekA(weekLabels[0]);
      setCompareWeekB(weekLabels[weekLabels.length - 1]);
    }
  }, [weekLabels, compareWeekA]);

  const wkComparison = useMemo(
    () => (wkCompareEnabled && compareWeekA && compareWeekB
      ? compareTwoWeeks(weeklyBreakdown, compareWeekA, compareWeekB)
      : []),
    [wkCompareEnabled, compareWeekA, compareWeekB, weeklyBreakdown],
  );

  const current = useMemo(
    () => computeWeeklyUploadMetrics(rows, headers, mapping),
    [rows, headers, mapping],
  );

  const groups = current.interventionBreakdown;

  const categoryLabel = categoryOptions.find(c => c.value === categoryFilter)?.label ?? 'All categories';
  const snapLabel = (id: string) => {
    const s = allSnapshots.find(x => x.id === id);
    return s ? formatUploadLabel(s.uploadedAt, s.fileName) : id;
  };

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {/* ── Overall sheet timeline (upload timestamps) ── */}
      <div style={{ background: '#f0f4ff', border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: '12px 16px', fontSize: 13 }}>
        <strong>Overall sheet timeline</strong> — each time you update Data Sources, a snapshot is recorded.
        X-axis shows <strong>when you uploaded</strong> (e.g. 3 updates per week in week 4).
        {publishedAt && (
          <span style={{ color: BRAND.textLight }}> · Latest: {formatUploadLabel(publishedAt, fileName ?? undefined)}</span>
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

        <label style={{ fontSize: 12, fontWeight: 600 }}>
          Timeline
          <select
            value={timelineMode}
            onChange={e => setTimelineMode(e.target.value as TimelineMode)}
            style={{ marginLeft: 8, padding: '6px 10px', borderRadius: 8, border: `1px solid ${BRAND.border}`, fontSize: 13 }}
          >
            <option value="each-upload">Each upload (timestamp)</option>
            <option value="weekly">One point per calendar week</option>
          </select>
        </label>

        <label style={{ fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={compareEnabled} onChange={e => setCompareEnabled(e.target.checked)} />
          Compare two updates
        </label>

        {compareEnabled && allSnapshots.length >= 2 && (
          <>
            <label style={{ fontSize: 12, fontWeight: 600 }}>
              Update A
              <select value={compareSnapA} onChange={e => setCompareSnapA(e.target.value)} style={{ marginLeft: 8, padding: '6px 10px', borderRadius: 8, border: `1px solid ${BRAND.border}`, fontSize: 12, maxWidth: 220 }}>
                {allSnapshots.map(s => (
                  <option key={s.id} value={s.id}>{formatUploadLabel(s.uploadedAt, s.fileName)}</option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 12, fontWeight: 600 }}>
              Update B
              <select value={compareSnapB} onChange={e => setCompareSnapB(e.target.value)} style={{ marginLeft: 8, padding: '6px 10px', borderRadius: 8, border: `1px solid ${BRAND.border}`, fontSize: 12, maxWidth: 220 }}>
                {allSnapshots.map(s => (
                  <option key={s.id} value={s.id}>{formatUploadLabel(s.uploadedAt, s.fileName)}</option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>

      {snapshotChartData.length === 0 ? (
        <div style={{ fontSize: 13, color: BRAND.textLight, padding: 16, border: `1px dashed ${BRAND.border}`, borderRadius: 10 }}>
          Upload your Overall sheet in <strong>Data Sources</strong> to record the first snapshot.
        </div>
      ) : snapshotChartData.length === 1 ? (
        <div style={{ fontSize: 13, color: BRAND.textLight, padding: 16, border: `1px dashed ${BRAND.border}`, borderRadius: 10 }}>
          First snapshot recorded at {snapshotChartData[0].fullLabel}. Re-upload after your next weekly update to see timestamp trend lines.
        </div>
      ) : (
        <>
          {compareEnabled && snapshotComparison.length > 0 && (
            <div style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Compare updates — {categoryLabel}</div>
              <div style={{ fontSize: 12, color: BRAND.textLight, marginBottom: 12 }}>
                {snapLabel(compareSnapA)} vs {snapLabel(compareSnapB)}
              </div>
              <div style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={snapshotComparison} margin={{ top: 8, right: 12, left: 0, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={BRAND.border} />
                    <XAxis dataKey="metric" fontSize={10} stroke={BRAND.textLight} angle={-20} textAnchor="end" height={60} />
                    <YAxis fontSize={11} stroke={BRAND.textLight} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="updateA" name="Update A" fill={BRAND.navy} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="updateB" name="Update B" fill={BRAND.blue} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
            <TimestampLineChart
              title="Students with attendance"
              hint={`Overall sheet · ${categoryLabel} · x-axis = upload time`}
              data={snapshotChartData}
              lines={[{ key: 'attendanceCount', name: 'Students attended', color: WEEKLY_CHART_COLORS.attendance }]}
            />
            <TimestampLineChart
              title="Assignments submitted"
              hint="All except No Submission"
              data={snapshotChartData}
              lines={[{ key: 'submitted', name: 'Submitted', color: WEEKLY_CHART_COLORS.submitted }]}
            />
            <TimestampLineChart
              title="Assignments accepted"
              hint="Accepted / completed only"
              data={snapshotChartData}
              lines={[{ key: 'accepted', name: 'Accepted', color: WEEKLY_CHART_COLORS.accepted }]}
            />
            <TimestampLineChart
              title="Quiz submissions"
              hint="Non-zero Quiz 1 / 2 / 3 scores"
              data={snapshotChartData}
              lines={[{ key: 'quizSubmissions', name: 'Quiz submissions', color: WEEKLY_CHART_COLORS.quiz }]}
            />
          </div>

          <TimestampLineChart
            title="Activity levels (Current Stat)"
            hint="Highly Active / Active / Partially Active from Overall sheet"
            data={snapshotChartData}
            lines={[
              { key: 'highlyActive', name: 'Highly Active', color: ACTIVITY_COLORS['Highly Active'] },
              { key: 'active', name: 'Active', color: ACTIVITY_COLORS.Active },
              { key: 'partiallyActive', name: 'Partially Active', color: ACTIVITY_COLORS['Partially Active'] },
            ]}
          />
        </>
      )}

      {/* ── WK session columns (single upload snapshot) ── */}
      <div style={{ borderTop: `2px solid ${BRAND.border}`, paddingTop: 16 }}>
        <div style={{ background: '#fafafa', border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: '12px 16px', fontSize: 13 }}>
          <strong>Session columns (WK0, WK1, WK2…)</strong> — breakdown from class session columns in the latest upload.
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginTop: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={wkCompareEnabled} onChange={e => setWkCompareEnabled(e.target.checked)} />
            Compare two WK periods
          </label>
          {wkCompareEnabled && weekLabels.length >= 2 && (
            <>
              <select value={compareWeekA} onChange={e => setCompareWeekA(e.target.value)} style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${BRAND.border}`, fontSize: 13 }}>
                {weekLabels.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
              <span style={{ fontSize: 12 }}>vs</span>
              <select value={compareWeekB} onChange={e => setCompareWeekB(e.target.value)} style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${BRAND.border}`, fontSize: 13 }}>
                {weekLabels.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </>
          )}
        </div>

        {weeklyBreakdown.length === 0 ? (
          <div style={{ fontSize: 13, color: BRAND.textLight, padding: 12, marginTop: 12, border: `1px dashed ${BRAND.border}`, borderRadius: 10 }}>
            No WK session columns in this upload.
          </div>
        ) : (
          <>
            {wkCompareEnabled && wkComparison.length > 0 && (
              <div style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 14, marginTop: 12 }}>
                <div style={{ height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={wkComparison} margin={{ top: 8, right: 12, left: 0, bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={BRAND.border} />
                      <XAxis dataKey="metric" fontSize={10} stroke={BRAND.textLight} angle={-20} textAnchor="end" height={60} />
                      <YAxis fontSize={11} stroke={BRAND.textLight} allowDecimals={false} />
                      <Legend />
                      <Bar dataKey="weekA" name={compareWeekA} fill={BRAND.navy} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="weekB" name={compareWeekB} fill={BRAND.blue} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginTop: 12 }}>
              <WeeklyLineChart title="WK attendance" hint={categoryLabel} data={weeklyBreakdown} lines={[{ key: 'attendanceCount', name: 'Attended', color: WEEKLY_CHART_COLORS.attendance }]} />
              <WeeklyLineChart title="WK assignments submitted" hint={categoryLabel} data={weeklyBreakdown} lines={[{ key: 'assignmentsSubmitted', name: 'Submitted', color: WEEKLY_CHART_COLORS.submitted }]} />
            </div>
          </>
        )}
      </div>

      {/* ── Current upload summary ── */}
      <div style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 14, overflowX: 'auto' }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Latest upload by category</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 800 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: `2px solid ${BRAND.border}` }}>
              {['Category', 'Students', 'Attended', 'Submitted', 'Accepted', 'Quiz', 'Highly Active', 'Active', 'Partial'].map(h => (
                <th key={h} style={{ padding: '8px 6px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g: WeeklyInterventionStats) => (
              <tr key={g.group} style={{ borderBottom: `1px solid ${BRAND.borderLight}` }}>
                <td style={{ padding: '8px 6px', fontWeight: 600 }}>{g.group}</td>
                <td style={{ padding: '8px 6px' }}>{g.studentCount}</td>
                <td style={{ padding: '8px 6px' }}>{g.attendanceCount ?? 0}</td>
                <td style={{ padding: '8px 6px' }}>{g.assignmentsSubmitted}</td>
                <td style={{ padding: '8px 6px' }}>{g.assignmentsAccepted}</td>
                <td style={{ padding: '8px 6px' }}>{g.quizSubmissions ?? 0}</td>
                <td style={{ padding: '8px 6px', color: ACTIVITY_COLORS['Highly Active'] }}>{g.highlyActive ?? 0}</td>
                <td style={{ padding: '8px 6px', color: ACTIVITY_COLORS.Active }}>{g.active ?? 0}</td>
                <td style={{ padding: '8px 6px', color: ACTIVITY_COLORS['Partially Active'] }}>{g.partiallyActive ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
