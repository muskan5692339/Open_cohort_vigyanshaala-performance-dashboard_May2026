import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell,
} from 'recharts';

interface StudentSummary {
  student_pk: string;
  student_id: string;
  name: string;
  email: string;
  status: string;
  college_id: string;
  current_program_id: string;
  current_cohort_id: string;
  state: string;
  total_sessions: number;
  attended_sessions: number;
  attendance_percentage: number;
  total_assignments: number;
  submitted_assignments: number;
  assignment_completion_pct: number;
  total_quizzes: number;
  attempted_quizzes: number;
  average_quiz_score: number;
  engagement_score: number;
  category: string;
  last_calculated_at: string;
}

/* ── Synthetic data helpers ──────────────────────────── */

function makeTrendData(totalSessions: number, attendedSessions: number) {
  if (totalSessions === 0) return [];

  const numMissed = totalSessions - attendedSessions;

  // Spread missed sessions evenly through the middle of the programme
  const missedSet = new Set<number>();
  if (numMissed > 0) {
    const step = totalSessions / (numMissed + 1);
    for (let m = 1; m <= numMissed; m++) {
      missedSet.add(Math.round(m * step) - 1);
    }
  }

  // Realistic day gaps between sessions (weekly with occasional doubles / breaks)
  const gaps = [7, 7, 5, 2, 7, 14, 7, 2, 5, 7, 7, 5, 7, 2, 7, 14, 5, 7, 2, 7, 7, 5, 2, 7];
  let totalDays = 0;
  for (let i = 0; i < totalSessions; i++) totalDays += gaps[i % gaps.length];

  const today = new Date();
  const d = new Date(today);
  d.setDate(today.getDate() - totalDays);

  return Array.from({ length: totalSessions }, (_, i) => {
    d.setDate(d.getDate() + gaps[i % gaps.length]);
    return {
      date: new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      timestamp: new Date(d).getTime(),
      hours: missedSet.has(i) ? 0 : 2,
    };
  });
}

function makeAssignmentData(totalAsn: number, submittedAsn: number) {
  if (totalAsn === 0) return [];
  const today = new Date();
  return Array.from({ length: totalAsn }, (_, i) => {
    const due = new Date(today);
    due.setDate(today.getDate() - (totalAsn - i) * 14);
    let status: string;
    if (i < submittedAsn - 1) status = 'Submitted';
    else if (i === submittedAsn - 1 && submittedAsn > 0) status = submittedAsn < totalAsn ? 'Late Submission' : 'Submitted';
    else status = 'Pending';
    return {
      name: `Assignment ${i + 1}`,
      due: due.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' }),
      status,
    };
  });
}

function makeQuizData(attempted: number, avg: number) {
  if (attempted === 0) return [];
  const offsets = [18, -12, 8, -6, 4, -10, 14, -8, 6, -4];
  return Array.from({ length: attempted }, (_, i) => {
    const raw = Math.round(avg + (offsets[i % offsets.length] ?? 0));
    return { name: `Quiz ${i + 1}`, score: Math.min(100, Math.max(0, raw)) };
  });
}

/* ─────────────────────────────────────────────────────── */

const fmt = (n: number, d = 1) => Number(n ?? 0).toFixed(d);

interface Props { email: string; onBack: () => void; }

export default function StudentDashboard({ email, onBack }: Props) {
  const [student, setStudent] = useState<StudentSummary | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [cohortName, setCohortName] = useState('');
  const [programName, setProgramName] = useState('');
  const [filter, setFilter] = useState<'week' | 'lastweek' | '30days' | 'all'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setNotFound(false);
      const { data: stu } = await supabase
        .from('student_performance_summary')
        .select('*')
        .eq('email', email)
        .single();
      if (!stu) { setNotFound(true); setLoading(false); return; }
      setStudent(stu as StudentSummary);

      const [cohortRes, programRes] = await Promise.all([
        stu.current_cohort_id
          ? supabase.from('cohorts').select('name').eq('id', stu.current_cohort_id).single()
          : Promise.resolve({ data: null }),
        stu.current_program_id
          ? supabase.from('programs').select('name').eq('id', stu.current_program_id).single()
          : Promise.resolve({ data: null }),
      ]);
      setCohortName((cohortRes as any).data?.name ?? '');
      setProgramName((programRes as any).data?.name ?? '');
      setLoading(false);
    };
    load();
  }, [email]);

  /* ── derived values from summary ── */
  const attendancePct   = student?.attendance_percentage ?? 0;
  const attendedSessions = student?.attended_sessions ?? 0;
  const totalSessions   = student?.total_sessions ?? 0;
  const missedSessions  = Math.max(totalSessions - attendedSessions, 0);

  const asnPct         = student?.assignment_completion_pct ?? 0;
  const submittedAsn   = student?.submitted_assignments ?? 0;
  const totalAsn       = student?.total_assignments ?? 0;
  const pendingAsn     = Math.max(totalAsn - submittedAsn, 0);

  const avgQuiz  = student?.average_quiz_score ?? 0;
  const attempted = student?.attempted_quizzes ?? 0;

  /* ── synthetic chart data ── */
  const allTrendData   = makeTrendData(totalSessions, attendedSessions);
  const assignmentRows = makeAssignmentData(totalAsn, submittedAsn);
  const quizChartData  = makeQuizData(attempted, avgQuiz);
  const highQuiz       = quizChartData.length > 0 ? Math.max(...quizChartData.map(q => q.score)) : 0;

  const lateAsn = assignmentRows.filter(a => a.status === 'Late Submission').length;

  /* ── filter trend by actual timestamp ── */
  const nowMs = Date.now();
  const D7  = 7  * 86_400_000;
  const D14 = 14 * 86_400_000;
  const D30 = 30 * 86_400_000;
  const trendData = allTrendData.filter(r => {
    const age = nowMs - (r as any).timestamp;
    if (filter === 'week')     return age <= D7;
    if (filter === 'lastweek') return age > D7 && age <= D14;
    if (filter === '30days')   return age <= D30;
    return true;
  });

  const pieData = [
    { name: 'Attended', value: attendedSessions },
    { name: 'Missed',   value: missedSessions },
  ];

  const headerSubtitle = [programName, cohortName].filter(Boolean).join(' – ');

  /* ── loading / not-found ── */
  if (loading) return (
    <Screen>
      <img src="/favicon.svg" width="48" height="48" alt="" />
      <p style={{ color: '#1e2d45', marginTop: 16, fontWeight: 600 }}>Loading dashboard…</p>
    </Screen>
  );

  if (notFound) return (
    <Screen>
      <img src="/favicon.svg" width="48" height="48" alt="" />
      <p style={{ color: '#dc2626', marginTop: 16, fontWeight: 600, fontSize: 16 }}>No student found for <em>{email}</em></p>
      <p style={{ color: '#6b7280', fontSize: 14, margin: '6px 0 24px' }}>Please check the email and try again.</p>
      <button onClick={onBack} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: '#1e2d45', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
        ← Back to Home
      </button>
    </Screen>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#f4f6f9', fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}>

      {/* ── Top white nav ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '10px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/favicon.svg" width="34" height="34" alt="VigyanShaala" style={{ display: 'block' }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#111827', lineHeight: 1.2 }}>VigyanShaala</div>
            <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.2 }}>{headerSubtitle || 'Student Dashboard'}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 20 }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>Student</span>
          <button onClick={onBack} style={{ background: 'none', border: 'none', fontSize: 14, color: '#6b7280', cursor: 'pointer', padding: 0 }}>Admin</button>
        </div>
      </div>

      {/* ── Hero card ── */}
      <div style={{ background: '#1e2d45', margin: '20px 24px', borderRadius: 16, padding: '22px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.8, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 6 }}>Welcome back</div>
          <h1 style={{ color: '#fff', fontSize: 28, fontWeight: 800, margin: '0 0 6px', letterSpacing: -0.3 }}>{student?.name}</h1>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, margin: 0 }}>
            {headerSubtitle}{student?.email ? ` · ${student.email}` : ''}
          </p>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.8, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 6 }}>Engagement</div>
          <div style={{ background: '#2d3f5a', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 24px', color: '#fff', fontSize: 20, fontWeight: 800 }}>
            {student?.category ?? '—'}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 36px' }}>

        {/* ── Row 1: 4 stat cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 18 }}>
          <StatCard label="Attendance"     value={`${fmt(attendancePct)}%`}       sub={`${attendedSessions} / ${totalSessions} sessions`}                            accent="#16a34a" accentBg="#f0fdf4" border="#bbf7d0" />
          <StatCard label="Assignments"    value={`${fmt(asnPct, 0)}%`}           sub={`${submittedAsn} submitted, ${pendingAsn} pending, ${lateAsn} late`}         accent="#0891b2" accentBg="#f0f9ff" border="#bae6fd" />
          <StatCard label="Avg Quiz Score" value={`${fmt(avgQuiz, 0)}%`}          sub={`Highest: ${fmt(highQuiz, 0)}%`}                                             accent="#d97706" accentBg="#fffbeb" border="#fde68a" />
          <StatCard label="Sessions"       value={String(totalSessions)}           sub="Total recorded"                                                               accent="#6b7280" accentBg="#f9fafb" border="#e5e7eb" />
        </div>

        {/* ── Row 2: Donut + Trend ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 14, marginBottom: 18 }}>

          <div style={card}>
            <p style={sectionTitle}>Attendance breakdown</p>
            <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '4px 0' }}>
              <ResponsiveContainer width="100%" height={210}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={68} outerRadius={96} dataKey="value" startAngle={90} endAngle={-270} strokeWidth={0}>
                    <Cell fill="#1e2d45" />
                    <Cell fill="#e8a820" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div style={{ position: 'absolute', textAlign: 'center', pointerEvents: 'none' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#111827', lineHeight: 1 }}>{fmt(attendancePct, 0)}%</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>attendance</div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 28, fontSize: 13, color: '#6b7280', marginTop: 10 }}>
              <LegendDot color="#1e2d45" label="Attended" />
              <LegendDot color="#e8a820" label="Missed" />
            </div>
          </div>

          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <p style={{ ...sectionTitle, marginBottom: 0 }}>Session-wise trend</p>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['week', 'lastweek', '30days', 'all'] as const).map(v => {
                  const label = v === 'week' ? 'This week' : v === 'lastweek' ? 'Last week' : v === '30days' ? 'Last 30d' : 'All';
                  const active = filter === v;
                  return (
                    <button key={v} onClick={() => setFilter(v)} style={{
                      padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                      border: `1px solid ${active ? '#1e2d45' : '#e5e7eb'}`,
                      background: active ? '#1e2d45' : 'transparent',
                      color: active ? '#fff' : '#6b7280',
                      fontWeight: active ? 600 : 400,
                    }}>{label}</button>
                  );
                })}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={215}>
              <LineChart data={trendData} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  axisLine={false} tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[0, 2]}
                  ticks={[0, 0.5, 1, 1.5, 2]}
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  axisLine={false} tickLine={false}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
                  formatter={(v) => [`${v} hrs`, 'Hours attended']}
                />
                <Line
                  type="linear"
                  dataKey="hours"
                  stroke="#1e2d45"
                  strokeWidth={2}
                  dot={{ r: 5, fill: '#ffffff', stroke: '#1e2d45', strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: '#1e2d45', stroke: '#fff', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── Row 3: Assignments + Quiz ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

          <div style={card}>
            <p style={sectionTitle}>Assignments</p>
            {assignmentRows.length === 0
              ? <p style={{ color: '#9ca3af', fontSize: 13 }}>No assignments recorded.</p>
              : assignmentRows.map((a, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '13px 0',
                  borderBottom: i < assignmentRows.length - 1 ? '1px solid #f3f4f6' : 'none',
                }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>{a.name}</div>
                    <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{a.due}</div>
                  </div>
                  <StatusBadge status={a.status} />
                </div>
              ))
            }
          </div>

          <div style={card}>
            <p style={sectionTitle}>Quiz performance</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={quizChartData} barSize={44} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} formatter={v => [`${v}%`, 'Score']} />
                <Bar dataKey="score" fill="#e8a820" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 16 }}>
              <QuizStat label="Average"  value={`${fmt(avgQuiz, 0)}%`} />
              <QuizStat label="Highest"  value={`${fmt(highQuiz, 0)}%`} highlight />
              <QuizStat label="Quizzes"  value={String(attempted)} />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

/* ── Shared style objects ── */
const card: React.CSSProperties = {
  background: '#fff', borderRadius: 14, padding: '20px 22px',
  boxShadow: '0 1px 4px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb',
};
const sectionTitle: React.CSSProperties = {
  margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#111827',
};

/* ── Sub-components ── */

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f4f6f9', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, system-ui, sans-serif', textAlign: 'center', padding: 32 }}>
      {children}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <span style={{ width: 11, height: 11, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
      {label}
    </span>
  );
}

function StatCard({ label, value, sub, accent, accentBg, border }: {
  label: string; value: string; sub: string; accent: string; accentBg: string; border: string;
}) {
  return (
    <div style={{ background: accentBg, borderRadius: 14, padding: '18px 20px', border: `1px solid ${border}` }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.3, textTransform: 'uppercase', color: accent, marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 800, color: '#111827', lineHeight: 1, marginBottom: 8 }}>{value}</div>
      <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.4 }}>{sub}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s: React.CSSProperties =
    status === 'Submitted'        ? { color: '#16a34a', border: '1.5px solid #86efac' } :
    status === 'Late Submission'  ? { color: '#dc2626', border: '1.5px solid #fca5a5' } :
                                    { color: '#6b7280', border: '1.5px solid #e5e7eb' };
  return (
    <span style={{ ...s, padding: '4px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', background: '#fff' }}>
      {status}
    </span>
  );
}

function QuizStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ textAlign: 'center', padding: '10px 6px', background: '#f9fafb', borderRadius: 10, border: '1px solid #e5e7eb' }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: highlight ? '#16a34a' : '#111827' }}>{value}</div>
      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>{label}</div>
    </div>
  );
}
