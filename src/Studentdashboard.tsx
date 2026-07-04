import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LabelList,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
} from 'recharts';
import { useUploadedExcel } from './context/UploadedExcelContext';
import type { ColumnMapping } from './types/dynamicSchema';
import {
  buildSessionTrendFromClassWise,
  buildPreRecordedTrendFromClassWise,
  buildAttendanceDonutFromHours,
  computeHoursBasedAttendance,
  countAttendedSessions,
  countMissedSessions,
  getClassWiseAttendanceForStudent,
  parseProgramHours,
  sessionHoursIndicatorColor,
  sessionHoursIndicatorFill,
} from './services/classWiseAttendance';
import { normalizeExcelCell } from './services/excelCellValue';
import {
  lookupStudentByEmail,
} from './services/studentEmailLookup';
import AnimeMetricAlert from './components/student/AnimeMetricAlert';
import AnimeHelpAssistant from './components/student/AnimeHelpAssistant';
import WeeklyUpdateNotice from './components/student/WeeklyUpdateNotice';
import './components/student/AnimeMetricAlert.css';
import './styles/StudentDashboard.css';

interface Props {
  email: string;
  onBack: () => void;
}

/** Minimum chart width per session so labels stay readable when scrolling. */
const SESSION_TREND_SLOT_WIDTH = 72;
type SessionTrendFocus = 'start' | 'latest';
type SessionChartSeries = 'live' | 'prerecorded';

type MappingEntry = ColumnMapping[string];

function stringifyCellValue(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string' && v.trim().startsWith('{"formula"')) {
    return normalizeExcelCell(JSON.parse(v) as unknown);
  }
  return normalizeExcelCell(v);
}

function parsePct(raw: unknown): number {
  const text = stringifyCellValue(raw);
  const m = text.match(/-?\d+(\.\d+)?/);
  if (!m) return 0;
  const n = Number(m[0]);
  if (!Number.isFinite(n)) return 0;
  const pct = text.includes('%') ? n : n <= 1 && n >= 0 ? n * 100 : n;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

function isAccepted(value: string): boolean {
  const s = value.toLowerCase();
  return ['accepted', 'submitted', 'complete', 'completed', 'pass'].some(k => s.includes(k));
}

function isPending(value: string): boolean {
  const s = value.toLowerCase();
  return ['pending', 'no submission', 'not submission', 'in progress', 'awaiting'].some(k => s.includes(k));
}

function normalizeColumnKey(key: string): string {
  return key.replace(/^\uFEFF/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function columnKeyMatches(key: string, keyword: string): boolean {
  const k = normalizeColumnKey(key);
  const kw = normalizeColumnKey(keyword);
  if (!k || !kw) return false;
  return k.includes(kw) || kw.includes(k);
}

function getByKeywords(row: Record<string, unknown>, keywords: string[]): string {
  const entries = Object.entries(row);
  for (const keyword of keywords) {
    for (const [key, value] of entries) {
      const lk = key.toLowerCase();
      if (lk.includes(keyword) || columnKeyMatches(key, keyword)) {
        const out = stringifyCellValue(value);
        if (out) return out;
      }
    }
  }
  return '—';
}

function resolveField(
  row: Record<string, unknown>,
  fallback: string | undefined,
  keywords: string[],
): string {
  const fromRow = getByKeywords(row, keywords);
  if (fromRow !== '—') return fromRow;
  if (fallback?.trim()) return fallback.trim();
  return '—';
}

function getMappedColumns(mapping: ColumnMapping, predicate: (entry: MappingEntry, col: string) => boolean): string[] {
  return Object.entries(mapping)
    .filter(([col, entry]) => predicate(entry, col))
    .map(([col]) => col);
}

function studentToDisplayRow(student: {
  student_id: string;
  name: string;
  email: string;
  college?: string;
  cohort?: string;
  state?: string;
  program?: string;
  imported_attendance_pct?: number;
  imported_assignment_pct?: number;
  imported_quiz_pct?: number;
}): Record<string, unknown> {
  return {
    Name: student.name,
    Email: student.email,
    'Student ID': student.student_id,
    College: student.college ?? '',
    Cohort: student.cohort ?? '',
    State: student.state ?? '',
    Program: student.program ?? '',
    'Attendance %': student.imported_attendance_pct != null ? String(student.imported_attendance_pct) : '',
    'Assignment %': student.imported_assignment_pct != null ? String(student.imported_assignment_pct) : '',
    'Quiz Score': student.imported_quiz_pct != null ? String(student.imported_quiz_pct) : '',
  };
}

function SessionTrendDot(props: { cx?: number; cy?: number; payload?: { value?: number }; active?: boolean }) {
  const { cx, cy, payload, active } = props;
  const v = Number(payload?.value ?? 0);
  if (cx == null || cy == null) return null;

  const labelY = cy - 16;

  if (v >= 1) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={4} fill="#22c55e" stroke="#1e2d45" strokeWidth={1.5} />
        <text x={cx} y={labelY} textAnchor="middle" fontSize={10} fill="var(--sd-text-muted)">{v}</text>
      </g>
    );
  }

  const stroke = sessionHoursIndicatorColor(v);
  const fill = sessionHoursIndicatorFill(v);

  return (
    <g className={`session-partial-dot ${active ? 'session-partial-dot--active' : ''}`}>
      <circle cx={cx} cy={cy} r={22} fill="transparent" className="session-partial-dot__hit" />
      <g transform={`translate(${cx}, ${cy})`}>
        <circle
          className="session-partial-dot__pulse"
          r={11}
          fill="none"
          stroke={stroke}
          strokeWidth={2}
          style={{ stroke }}
        />
        <circle
          className="session-partial-dot__ring-outer"
          r={8.5}
          fill="none"
          stroke={stroke}
          strokeWidth={1.5}
          opacity={0.55}
          style={{ stroke }}
        />
        <circle
          className="session-partial-dot__ring"
          r={6}
          fill={fill}
          stroke={stroke}
          strokeWidth={active ? 2.75 : 2}
          style={{ stroke }}
        />
        <circle className="session-partial-dot__core" r={2.5} fill={stroke} />
      </g>
      <text x={cx} y={labelY} textAnchor="middle" fontSize={10} fontWeight={700} fill={stroke}>
        {v}
      </text>
    </g>
  );
}

export default function StudentDashboard({ email, onBack }: Props) {
  const { payload } = useUploadedExcel();
  const mapping = (payload?.mapping ?? {}) as ColumnMapping;
  const sessionTrendScrollRef = useRef<HTMLDivElement>(null);
  const [sessionTrendFocus, setSessionTrendFocus] = useState<SessionTrendFocus>('start');
  const [sessionChartSeries, setSessionChartSeries] = useState<SessionChartSeries>('live');

  const lookup = useMemo(() => lookupStudentByEmail(payload, email), [payload, email]);

  const matched = useMemo(() => {
    if (!lookup) return null;
    return lookup.rawRow ?? studentToDisplayRow(lookup.student);
  }, [lookup]);

  const classWiseEntry = useMemo(
    () => getClassWiseAttendanceForStudent(payload, email),
    [payload, email],
  );
  const liveTrendLength = classWiseEntry?.sessions.length ?? 0;
  const preRecordedTrendLength = classWiseEntry?.preRecorded?.length ?? 0;

  useEffect(() => {
    setSessionTrendFocus('start');
    if (!liveTrendLength && preRecordedTrendLength) {
      setSessionChartSeries('prerecorded');
    } else {
      setSessionChartSeries('live');
    }
    sessionTrendScrollRef.current?.scrollTo({ left: 0, behavior: 'auto' });
  }, [email, liveTrendLength, preRecordedTrendLength]);

  const activeTrendLength = sessionChartSeries === 'live' ? liveTrendLength : preRecordedTrendLength;

  useEffect(() => {
    setSessionTrendFocus('start');
    sessionTrendScrollRef.current?.scrollTo({ left: 0, behavior: 'auto' });
  }, [sessionChartSeries]);

  useEffect(() => {
    const el = sessionTrendScrollRef.current;
    if (!el || activeTrendLength === 0) return;
    const frame = requestAnimationFrame(() => {
      const targetLeft = sessionTrendFocus === 'latest'
        ? Math.max(0, el.scrollWidth - el.clientWidth)
        : 0;
      el.scrollTo({ left: targetLeft, behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [sessionTrendFocus, activeTrendLength, email, sessionChartSeries]);

  if (!payload || !matched || !lookup) {
    return (
      <div className="student-page">
        <div className="student-shell student-empty">
          <p>No student found with this email ID.</p>
          <button type="button" className="student-back-btn" onClick={onBack}>
            Back
          </button>
        </div>
      </div>
    );
  }

  const student = lookup.student;
  const classWise = getClassWiseAttendanceForStudent(payload, email);

  const attendanceCols = getMappedColumns(mapping, (entry, col) => entry.mappedRole === 'attendance' || col.toLowerCase().includes('attendance'));
  const mappedAssignmentCols = getMappedColumns(mapping, (entry, col) => entry.mappedRole === 'assignment' || col.toLowerCase().includes('assignment'));
  const rowAssignmentCols = Object.keys(matched).filter(col => {
    const l = col.toLowerCase();
    return l.includes('assignment') || ['swot', 'resume', 'career exploration', 'career planner', 'vision board', 'endline'].some(k => l.includes(k));
  });
  const assignmentCols = Array.from(new Set([...mappedAssignmentCols, ...rowAssignmentCols]));
  const mappedQuizCols = getMappedColumns(mapping, (entry, col) => entry.mappedRole === 'assessment' || col.toLowerCase().includes('quiz'));
  const rowQuizCols = Object.keys(matched).filter(col => col.toLowerCase().includes('quiz'));
  const quizCols = Array.from(new Set([...mappedQuizCols, ...rowQuizCols]));

  const rowAttendancePctCols = Object.keys(matched).filter(col => {
    const l = col.toLowerCase();
    return (l.includes('attendance') && l.includes('%')) || l.includes('attendance percent') || l.includes('attendance percentage');
  });
  const attendancePctCol = rowAttendancePctCols[0]
    ?? attendanceCols.find(col => col.toLowerCase().includes('%'))
    ?? attendanceCols[0];

  const classesAttendedRaw = getByKeywords(matched, ['no. of classes attended', 'classes attended', 'no of classes attended']);
  const totalClassesRaw = getByKeywords(matched, ['program hours', 'total classes', 'no. of classes', 'sessions']);
  const programHoursFromRow = getByKeywords(matched, ['program hours', 'programme hours', 'total hours']);
  const programHoursParsed = parseProgramHours(programHoursFromRow);
  const sessionSlotCount = classWise?.sessions.length ?? 0;
  // Total program hours = number of class-wise session slots (e.g. 6), not master-sheet decimals.
  const totalProgramHours =
    sessionSlotCount > 0
      ? sessionSlotCount
      : programHoursParsed ?? null;

  const sessions = classWise
    ? classWise.sessions.length
    : Math.max(0, parseInt(classesAttendedRaw, 10) || parseInt(totalClassesRaw, 10) || 0);
  const attendedSessionCount = classWise
    ? countAttendedSessions(classWise)
    : Math.max(0, parseInt(classesAttendedRaw, 10) || 0);
  const missedSessionCount = classWise
    ? countMissedSessions(classWise)
    : Math.max(0, sessions - attendedSessionCount);

  const hoursAttendance = classWise
    ? computeHoursBasedAttendance(classWise, totalProgramHours)
    : null;

  const attendedHours = hoursAttendance?.attendedHours ?? 0;
  const totalHours = hoursAttendance?.totalHours ?? totalProgramHours ?? sessions;

  const attendancePct = hoursAttendance
    ? hoursAttendance.attendedPct
    : student.imported_attendance_pct != null
      ? Math.round(student.imported_attendance_pct * 100) / 100
      : attendancePctCol
        ? parsePct(matched[attendancePctCol])
        : totalHours > 0
          ? Math.round((attendedHours / totalHours) * 10000) / 100
          : sessions > 0
            ? Math.round((attendedSessionCount / sessions) * 100)
            : 0;

  const missedAttendancePct = hoursAttendance
    ? hoursAttendance.missedPct
    : Math.max(0, Math.round((100 - attendancePct) * 100) / 100);
  const assignmentPct = assignmentCols.length
    ? Math.round((assignmentCols.filter(col => isAccepted(stringifyCellValue(matched[col]))).length / assignmentCols.length) * 100) || 0
    : (() => {
        const rows = (payload.assignments ?? []).filter(a => a.student_email.toLowerCase() === student.email.toLowerCase());
        if (!rows.length) return 0;
        const done = rows.filter(a => isAccepted(a.status)).length;
        return Math.round((done / rows.length) * 100);
      })();
  const quizScoreCols = quizCols.filter(col => !col.toLowerCase().includes('final score'));
  const quizScores = quizScoreCols.map(col => parsePct(matched[col]));
  const avgQuiz = quizScoreCols.length
    ? Math.round(quizScores.reduce((a, b) => a + b, 0) / quizScoreCols.length)
    : 0;

  const programHoursLabel =
    attendedHours > 0 && totalHours > 0
      ? `${attendedHours.toFixed(2)} / ${Number.isInteger(totalHours) ? totalHours : totalHours.toFixed(2)} hrs`
      : programHoursFromRow !== '—'
        ? programHoursFromRow
        : '—';

  // Weighted engagement score: Attendance 40%, Assignments 40%, Quiz 20%
  const avgEngagement = Math.round(attendancePct * 0.4 + assignmentPct * 0.4 + avgQuiz * 0.2);
  const engagementLabel = avgEngagement >= 70 ? 'High Engagement' : avgEngagement >= 40 ? 'Medium Engagement' : 'Low Engagement';

  const assignmentRows = assignmentCols.length
    ? assignmentCols.slice(0, 8).map(col => {
        const status = stringifyCellValue(matched[col]) || 'Pending';
        return { name: col.replace(/_/g, ' '), date: '—', status };
      })
    : (payload.assignments ?? [])
        .filter(a => a.student_email.toLowerCase() === student.email.toLowerCase())
        .slice(0, 8)
        .map(a => ({
          name: a.assignment_name,
          date: a.due_date ? new Date(a.due_date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' }) : '—',
          status: a.status,
        }));

  const quizBarData = quizScoreCols
    .map(col => ({
      name: col.replace(/_/g, ' ').trim() || 'Quiz',
      score: parsePct(matched[col]),
    }));
  const quizData = quizBarData.length ? quizBarData : [{ name: 'Quiz', score: avgQuiz }];
  const quizHighest = quizData.reduce((max, x) => Math.max(max, x.score), 0);

  const attendanceDonut = hoursAttendance
    ? buildAttendanceDonutFromHours(hoursAttendance.attendedPct, hoursAttendance.missedPct)
    : attendedSessionCount > 0 || missedSessionCount > 0
      ? buildAttendanceDonutFromHours(
          totalHours > 0 ? Math.round((attendedSessionCount / totalHours) * 10000) / 100 : attendancePct,
          missedAttendancePct,
        )
      : attendancePct > 0
        ? buildAttendanceDonutFromHours(attendancePct, missedAttendancePct)
        : buildAttendanceDonutFromHours(0, 0);

  const sessionTrend = classWise ? buildSessionTrendFromClassWise(classWise) : [];
  const preRecordedTrend = classWise ? buildPreRecordedTrendFromClassWise(classWise) : [];
  const activeSessionTrend = sessionChartSeries === 'live' ? sessionTrend : preRecordedTrend;
  const hasLiveTrend = sessionTrend.length > 0;
  const hasPreRecordedTrend = preRecordedTrend.length > 0;
  const hasAnySessionTrend = hasLiveTrend || hasPreRecordedTrend;
  const sessionTrendMax = activeSessionTrend.length
    ? Math.max(1, ...activeSessionTrend.map(p => p.value))
    : 1;
  const sessionTrendYMax = Math.max(1.2, Math.ceil(sessionTrendMax * 1.15 * 10) / 10);
  const sessionTrendChartWidth = Math.max(activeSessionTrend.length * SESSION_TREND_SLOT_WIDTH, 320);
  const sessionTrendNeedsScroll = activeSessionTrend.length > 4;
  const sessionTrendTooltipLabel = sessionChartSeries === 'live' ? 'Attended' : 'Watched';
  const sessionTrendScrollHint = sessionChartSeries === 'live'
    ? `${activeSessionTrend.length} classes · scroll sideways →`
    : `${activeSessionTrend.length} videos · scroll sideways →`;

  const studentName = resolveField(matched, student.name, ['full name', 'name', 'student name']);
  const studentId = resolveField(matched, student.student_id, ['student id', 'student_id', 'vs id', 'id']);
  const studentEmail = resolveField(matched, student.email, ['email']);
  const phone = resolveField(matched, undefined, ['phone', 'mobile', 'contact']);
  const studentCourse = resolveField(matched, student.program, [
    'course',
    'program',
    'programme',
    'program name',
    'degree',
    'currently pursuing degree',
    'currently_pursuing_degree',
  ]);
  const pursuingYear = resolveField(matched, undefined, [
    'current pursuing year',
    'pursuing year',
    'current year',
    'academic year',
    'year of study',
    'year',
  ]);

  const cohort = resolveField(matched, student.cohort || payload.cohortName, ['cohort', 'batch', 'program cohort']);
  const college = resolveField(matched, student.college, ['college', 'university', 'institution']);
  const studentCategory = resolveField(matched, undefined, ['student_cat', 'student category', 'college category', 'institution category']);

  return (
    <div className="student-page">
      <section className="student-shell">
        <div className="student-notice-strip">
          <WeeklyUpdateNotice />
        </div>
        <header className="student-header">
          <div className="student-header-top">
            <h1 className="student-name">{studentName}</h1>
            <span className="engagement-badge">{engagementLabel}</span>
          </div>
          <div className="student-meta">
            <span>ID: {studentId}</span>
            <span>Email: {studentEmail}</span>
            <span>Phone: {phone}</span>
            <span>Course: {studentCourse}</span>
            <span>Year: {pursuingYear}</span>
          </div>
          <div className="header-profile-grid">
            <div className="header-field">
              <div className="header-label">Cohort</div>
              <div className="header-value">{cohort}</div>
            </div>
            <div className="header-field">
              <div className="header-label">College/University</div>
              <div className="header-value">{college}</div>
            </div>
            <div className="header-field">
              <div className="header-label">Student Category</div>
              <div className="header-value">{studentCategory}</div>
            </div>
          </div>
        </header>

        <div className="section-body">
          <div className="stat-row">
            <StatCard label="Attendance" value={`${attendancePct.toFixed(1)}%`} subtitle={programHoursLabel} warn={attendancePct === 0} />
            <div className={`metric-alert-wrap ${assignmentPct === 0 ? 'metric-alert-wrap--hot' : ''}`}>
              <StatCard label="Assignments" value={`${assignmentPct}%`} subtitle={`${assignmentRows.length} tracked items`} warn={assignmentPct === 0} />
              <AnimeMetricAlert
                variant="assignment"
                show={assignmentPct === 0}
                label="Assignments"
                message="Pending work detected! Complete your assignments to boost your score."
              />
            </div>
            <div className={`metric-alert-wrap ${avgQuiz === 0 ? 'metric-alert-wrap--hot' : ''}`}>
              <StatCard label="Avg Quiz Score" value={`${avgQuiz}%`} subtitle={quizScoreCols.length ? 'From quiz columns' : 'No quiz data'} warn={avgQuiz === 0} />
              <AnimeMetricAlert
                variant="quiz"
                show={avgQuiz === 0}
                label="Quizzes"
                message="No quiz scores yet. Attempt quizzes when they open — they count toward your profile!"
              />
            </div>
            <StatCard
              label="Sessions"
              value={attendedHours > 0 || totalHours > 0 ? `${attendedHours.toFixed(2)} hrs` : String(sessions || 0)}
              subtitle={totalHours > 0 ? `${totalHours} program hrs` : `${sessions || 0} total sessions`}
              warn={attendedHours === 0 && sessions === 0}
            />
          </div>

          <div className="charts-grid">
            <article className="panel-card panel-large">
              <h3>Attendance breakdown</h3>
              <div className="panel-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={attendanceDonut} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92}>
                      <Cell fill="var(--sd-success)" />
                      <Cell fill="var(--sd-amber)" />
                    </Pie>
                    <Tooltip
                      formatter={(value, name) => [`${Number(value ?? 0).toFixed(1)}%`, String(name ?? '')]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="legend-row">
                <span><i className="legend-dot attended" />Attended ({attendancePct.toFixed(1)}%)</span>
                <span><i className="legend-dot missed" />Missed ({missedAttendancePct.toFixed(1)}%)</span>
              </div>
            </article>

            <article className="panel-card panel-large">
              <h3>Quiz performance</h3>
              <div className="panel-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={quizData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--sd-border)" />
                    <XAxis
                      dataKey="name"
                      stroke="var(--sd-text-muted)"
                      fontSize={11}
                      interval={0}
                      tickFormatter={value => {
                        const text = String(value ?? '');
                        return text.length > 26 ? `${text.slice(0, 26)}...` : text;
                      }}
                    />
                    <YAxis domain={[0, 100]} stroke="var(--sd-text-muted)" fontSize={11} />
                    <Tooltip />
                    <Bar dataKey="score" radius={[6, 6, 0, 0]}>
                      {quizData.map((entry, idx) => (
                        <Cell key={`${entry.name}-${idx}`} fill={entry.score >= 100 ? 'var(--sd-light-green)' : 'var(--sd-accent)'} />
                      ))}
                      <LabelList dataKey="score" position="top" fontSize={11} fill="var(--sd-text)" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="quiz-summary">
                <MiniStat label="Average" value={`${avgQuiz}%`} />
                <MiniStat label="Highest" value={`${quizHighest}%`} />
                <MiniStat label="Count" value={String(quizData.length)} />
              </div>
            </article>

            <article className="panel-card panel-large">
              <h3>Assignments</h3>
              <div className="assignment-list">
                {assignmentRows.map(item => {
                  const pending = isPending(item.status);
                  const accepted = isAccepted(item.status);
                  return (
                    <div className="assignment-row" key={item.name}>
                      <div>
                        <div className="assignment-name">{item.name}</div>
                        <div className="assignment-date">{item.date}</div>
                      </div>
                      <span className={`status-pill ${accepted ? 'accepted' : pending ? 'pending' : ''}`}>
                        {item.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            </article>

            <article className="panel-card panel-large session-trend-panel">
              <h3>Session-wise trend</h3>
              {hasAnySessionTrend && (
                <div className="session-trend-controls" role="group" aria-label="Session chart options">
                  <div className="session-trend-view-toggle session-trend-series-toggle">
                    <button
                      type="button"
                      className={`session-trend-toggle-btn${sessionChartSeries === 'live' ? ' active' : ''}`}
                      onClick={() => setSessionChartSeries('live')}
                      aria-pressed={sessionChartSeries === 'live'}
                      disabled={!hasLiveTrend}
                    >
                      Live classes
                    </button>
                    <button
                      type="button"
                      className={`session-trend-toggle-btn${sessionChartSeries === 'prerecorded' ? ' active' : ''}`}
                      onClick={() => setSessionChartSeries('prerecorded')}
                      aria-pressed={sessionChartSeries === 'prerecorded'}
                    >
                      Pre-recorded videos
                    </button>
                  </div>
                  {activeSessionTrend.length > 0 && sessionTrendNeedsScroll && (
                    <>
                      <div className="session-trend-view-toggle">
                        <button
                          type="button"
                          className={`session-trend-toggle-btn${sessionTrendFocus === 'start' ? ' active' : ''}`}
                          onClick={() => setSessionTrendFocus('start')}
                          aria-pressed={sessionTrendFocus === 'start'}
                        >
                          Program start
                        </button>
                        <button
                          type="button"
                          className={`session-trend-toggle-btn${sessionTrendFocus === 'latest' ? ' active' : ''}`}
                          onClick={() => setSessionTrendFocus('latest')}
                          aria-pressed={sessionTrendFocus === 'latest'}
                        >
                          {sessionChartSeries === 'live' ? 'Latest class' : 'Latest video'}
                        </button>
                      </div>
                      <span className="session-trend-scroll-hint">{sessionTrendScrollHint}</span>
                    </>
                  )}
                </div>
              )}
              {activeSessionTrend.length > 0 ? (
                <div
                  ref={sessionTrendScrollRef}
                  className={`panel-chart${sessionTrendNeedsScroll ? ' panel-chart--scroll' : ''}`}
                >
                  <div
                    className="session-trend-scroll"
                    style={{
                      width: sessionTrendNeedsScroll ? sessionTrendChartWidth : '100%',
                      minWidth: '100%',
                      height: '100%',
                    }}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={activeSessionTrend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--sd-border)" />
                        <XAxis
                          dataKey="name"
                          stroke="var(--sd-text-muted)"
                          fontSize={10}
                          interval={0}
                          angle={-25}
                          textAnchor="end"
                          height={56}
                        />
                        <YAxis
                          domain={[0, sessionTrendYMax]}
                          stroke="var(--sd-text-muted)"
                          fontSize={11}
                          label={{ value: 'Hours', angle: -90, position: 'insideLeft', fontSize: 11, fill: 'var(--sd-text-muted)' }}
                        />
                        <Tooltip formatter={(value) => [`${Number(value ?? 0)} hrs`, sessionTrendTooltipLabel]} />
                        <Line
                          type="monotone"
                          dataKey="value"
                          stroke="var(--sd-primary)"
                          strokeWidth={2.5}
                          dot={(props) => <SessionTrendDot {...props} />}
                          activeDot={(props) => <SessionTrendDot {...props} active />}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : hasAnySessionTrend ? (
                <p style={{ fontSize: 13, color: 'var(--sd-text-muted)', margin: '24px 0', lineHeight: 1.6 }}>
                  No pre-recorded video data for this student yet. Re-upload the workbook with
                  {' '}&quot;Pre-recorded&quot; columns in the Class-wise Attendance sheet.
                </p>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--sd-text-muted)', margin: '24px 0', lineHeight: 1.6 }}>
                  No class-wise attendance data for this student. Re-upload the workbook and ensure it includes a
                  {' '}&quot;Class-wise Attendance&quot; sheet with session columns (e.g. WK0_SUK, WK1_WS).
                </p>
              )}
            </article>
          </div>

          <div className="back-row">
            <button type="button" className="student-back-btn" onClick={onBack}>Back</button>
          </div>
        </div>
      </section>
      <AnimeHelpAssistant />
    </div>
  );
}

function StatCard({
  label,
  value,
  subtitle,
  warn,
}: {
  label: string;
  value: string;
  subtitle: string;
  warn?: boolean;
}) {
  return (
    <article className="stat-card">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${warn ? 'warn' : ''}`}>{value}</div>
      <div className="stat-subtitle">{subtitle}</div>
    </article>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="mini-stat">
      <div className="mini-label">{label}</div>
      <div className="mini-value">{value}</div>
    </div>
  );
}

