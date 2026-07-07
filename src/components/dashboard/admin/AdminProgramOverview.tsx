import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ColumnMapping } from '../../../types/dynamicSchema';
import { BRAND } from '../../../types/adminTypes';
import {
  ACTIVITY_COLORS,
  ACTIVITY_LEVELS,
  type ActivityLevel,
  type ProgramStudentRecord,
  computeProgramOverview,
} from '../../../services/programOverviewMetrics';

interface Props {
  rows: Record<string, string>[];
  headers: string[];
  mapping: ColumnMapping | undefined;
}

function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, color: BRAND.textLight, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: BRAND.navy, marginTop: 4 }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: BRAND.textMuted, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function StudentTable({ students, onClear }: { students: ProgramStudentRecord[]; onClear: () => void }) {
  if (!students.length) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: BRAND.textLight, fontSize: 13 }}>
        No students match this filter.
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{students.length} student{students.length === 1 ? '' : 's'}</div>
        <button
          type="button"
          onClick={onClear}
          style={{
            fontSize: 12,
            padding: '6px 12px',
            borderRadius: 8,
            border: `1px solid ${BRAND.border}`,
            background: BRAND.card,
            cursor: 'pointer',
          }}
        >
          Clear filter
        </button>
      </div>
      <div style={{ overflowX: 'auto', maxHeight: 360, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
              {['Name', 'Email', 'Category', 'Status', 'Attend %', 'Asgn submit', 'Asgn accept', 'Quiz submit', 'Quiz avg'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: `1px solid ${BRAND.border}`, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.map(s => (
              <tr key={s.key} style={{ borderBottom: `1px solid ${BRAND.borderLight}` }}>
                <td style={{ padding: '8px 10px', fontWeight: 600 }}>{s.name}</td>
                <td style={{ padding: '8px 10px', color: BRAND.textLight }}>{s.email || '—'}</td>
                <td style={{ padding: '8px 10px' }}>{s.category}</td>
                <td style={{ padding: '8px 10px' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 600,
                    background: `${ACTIVITY_COLORS[s.activityLevel]}22`,
                    color: ACTIVITY_COLORS[s.activityLevel],
                  }}>
                    {s.activityLevel}
                  </span>
                </td>
                <td style={{ padding: '8px 10px' }}>{s.attendancePct}%</td>
                <td style={{ padding: '8px 10px' }}>{s.assignmentSubmissionPct}%</td>
                <td style={{ padding: '8px 10px' }}>{s.assignmentAcceptancePct}%</td>
                <td style={{ padding: '8px 10px' }}>{s.quizSubmissionPct}%</td>
                <td style={{ padding: '8px 10px' }}>{s.quizScoreAvg}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AdminProgramOverview({ rows, headers, mapping }: Props) {
  const overview = useMemo(() => computeProgramOverview(rows, headers, mapping), [rows, headers, mapping]);
  const [selectedActivity, setSelectedActivity] = useState<ActivityLevel | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const pieData = overview.activity
    .filter(d => d.count > 0)
    .map(d => ({ name: d.level, value: d.count, pct: d.pct }));

  const performanceData = [
    { metric: 'Assignment submission', value: overview.assignmentSubmissionPct, fill: BRAND.blue },
    { metric: 'Assignment acceptance', value: overview.assignmentAcceptancePct, fill: BRAND.green },
    { metric: 'Quiz submission', value: overview.avgQuizSubmissionPct, fill: '#8b5cf6' },
    { metric: 'Quiz score avg', value: overview.avgQuizScore, fill: BRAND.yellowDark },
  ];

  const categoryChartData = overview.byCategory.map(cat => {
    const row: Record<string, string | number> = { category: cat.category };
    for (const level of ACTIVITY_LEVELS) {
      const entry = cat.activity.find(a => a.level === level);
      row[level] = entry?.pct ?? 0;
    }
    return row;
  });

  const filteredStudents = useMemo(() => {
    let list = overview.students;
    if (selectedActivity) list = list.filter(s => s.activityLevel === selectedActivity);
    if (selectedCategory) list = list.filter(s => s.category === selectedCategory);
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [overview.students, selectedActivity, selectedCategory]);

  const handlePieClick = (data: { name?: string }) => {
    const level = data?.name as ActivityLevel | undefined;
    if (!level || !ACTIVITY_LEVELS.includes(level)) return;
    setSelectedActivity(prev => (prev === level ? null : level));
  };

  const statusHint = overview.statusColumn
    ? `Activity tiers from Excel column "${overview.statusColumn}". Empty or unrecognized values count as Inactive.`
    : 'No "current status" column found — all students shown as Inactive until you add that column to your Overall sheet.';

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ background: '#f0f4ff', border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: '12px 16px', fontSize: 13 }}>
        <strong>Program Overview</strong> — current cohort snapshot from your latest upload.
        <span style={{ color: BRAND.textLight }}> · {overview.totalStudents} students</span>
        <div style={{ fontSize: 12, color: BRAND.textMuted, marginTop: 6 }}>{statusHint}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
        {overview.activity.map(a => (
          <button
            key={a.level}
            type="button"
            onClick={() => setSelectedActivity(prev => (prev === a.level ? null : a.level))}
            style={{
              textAlign: 'left',
              cursor: 'pointer',
              border: selectedActivity === a.level ? `2px solid ${ACTIVITY_COLORS[a.level]}` : `1px solid ${BRAND.border}`,
              borderRadius: 10,
              padding: 0,
              background: 'transparent',
            }}
          >
            <KpiCard
              label={a.level}
              value={`${a.pct}%`}
              hint={`${a.count} students · click to filter`}
            />
          </button>
        ))}
        <KpiCard label="Assignment submission" value={`${overview.assignmentSubmissionPct}%`} hint="Submitted / total slots" />
        <KpiCard label="Assignment acceptance" value={`${overview.assignmentAcceptancePct}%`} hint="Accepted / submitted" />
        <KpiCard label="Avg quiz submission" value={`${overview.avgQuizSubmissionPct}%`} hint="Quizzes with a score" />
        <KpiCard label="Quiz score avg" value={`${overview.avgQuizScore}%`} hint="Missing quiz = 0%" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
        <div style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Activity distribution</div>
          <div style={{ fontSize: 12, color: BRAND.textLight, marginBottom: 12 }}>Click a slice to see students in that tier</div>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={2}
                  onClick={(_, index) => handlePieClick(pieData[index])}
                  style={{ cursor: 'pointer' }}
                >
                  {pieData.map(entry => (
                    <Cell key={entry.name} fill={ACTIVITY_COLORS[entry.name as ActivityLevel] ?? '#6b7280'} opacity={selectedActivity && selectedActivity !== entry.name ? 0.35 : 1} />
                  ))}
                </Pie>
                <Tooltip formatter={(value, name, item) => [`${value} students (${(item?.payload as { pct?: number })?.pct ?? 0}%)`, String(name)]} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Assignment & quiz performance</div>
          <div style={{ fontSize: 12, color: BRAND.textLight, marginBottom: 12 }}>Cohort-wide averages (%)</div>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={performanceData} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={BRAND.border} />
                <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} fontSize={11} />
                <YAxis type="category" dataKey="metric" width={130} fontSize={11} />
                <Tooltip formatter={(v) => [`${Number(v ?? 0)}%`, 'Value']} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {performanceData.map(entry => (
                    <Cell key={entry.metric} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {overview.byCategory.length > 0 && (
        <div style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Breakdown by student category</div>
          <div style={{ fontSize: 12, color: BRAND.textLight, marginBottom: 12 }}>
            Stacked % by activity tier — click a category bar to filter the student list
          </div>
          <div style={{ height: Math.max(220, overview.byCategory.length * 36) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={categoryChartData}
                layout="vertical"
                margin={{ left: 8, right: 16 }}
                onClick={state => {
                  const cat = state?.activeLabel;
                  if (typeof cat === 'string') {
                    setSelectedCategory(prev => (prev === cat ? null : cat));
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={BRAND.border} />
                <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} fontSize={11} />
                <YAxis type="category" dataKey="category" width={100} fontSize={11} />
                <Tooltip formatter={(v, name) => [`${Number(v ?? 0)}%`, String(name)]} />
                <Legend />
                {ACTIVITY_LEVELS.map(level => (
                  <Bar
                    key={level}
                    dataKey={level}
                    stackId="activity"
                    fill={ACTIVITY_COLORS[level]}
                    opacity={selectedCategory ? 0.85 : 1}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginTop: 14 }}>
            {overview.byCategory.map(cat => (
              <button
                key={cat.category}
                type="button"
                onClick={() => setSelectedCategory(prev => (prev === cat.category ? null : cat.category))}
                style={{
                  textAlign: 'left',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: selectedCategory === cat.category ? `2px solid ${BRAND.navy}` : `1px solid ${BRAND.border}`,
                  background: selectedCategory === cat.category ? '#f0f4ff' : BRAND.card,
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 6 }}>{cat.category} ({cat.studentCount})</div>
                <div style={{ color: BRAND.textLight, lineHeight: 1.5 }}>
                  Submit {cat.assignmentSubmissionPct}% · Accept {cat.assignmentAcceptancePct}%<br />
                  Quiz submit {cat.avgQuizSubmissionPct}% · Quiz avg {cat.avgQuizScore}%
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
          Student list
          {selectedActivity && <span style={{ fontWeight: 500, color: ACTIVITY_COLORS[selectedActivity] }}> · {selectedActivity}</span>}
          {selectedCategory && <span style={{ fontWeight: 500, color: BRAND.navy }}> · {selectedCategory}</span>}
        </div>
        <div style={{ fontSize: 12, color: BRAND.textLight, marginBottom: 12 }}>
          Click activity KPIs, pie slices, or category cards to drill down
        </div>
        <StudentTable
          students={filteredStudents}
          onClear={() => { setSelectedActivity(null); setSelectedCategory(null); }}
        />
      </div>
    </div>
  );
}
