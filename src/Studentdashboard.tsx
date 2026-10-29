import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ResponsiveContainer,
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
  lookupStudentByEmail,
} from './services/studentEmailLookup';
import AnimeMetricAlert from './components/student/AnimeMetricAlert';
import AnimeHelpAssistant from './components/student/AnimeHelpAssistant';
import ChartDataUpdatedBubble from './components/student/ChartDataUpdatedBubble';
import BrandBanner from './components/brand/BrandBanner';
import ChartMobileFrame from './components/student/ChartMobileFrame';
import ChartSnapshotActions from './components/student/ChartSnapshotActions';
import StudentProfileEditPanel from './components/student/StudentProfileEditPanel';
import ProgramJourneyCard from './components/student/ProgramJourneyCard';
import './components/student/StudentProfileEditPanel.css';
import './components/student/AnimeMetricAlert.css';
import './components/student/ChartDataUpdatedBubble.css';
import './components/student/ChartMobileFrame.css';
import './components/student/ChartSnapshotActions.css';
import {
  getAssignmentStatusExplanation,
  isAssignmentCommentColumn,
  resolveAssignmentDisplayFields,
  REJECTED_ASSIGNMENT_STEPS,
} from './services/studentAssignmentDisplay';
import {
  buildSessionTrendFromClassWise,
  buildPreRecordedTrendFromClassWise,
  getClassWiseAttendanceForStudent,
  sessionHoursIndicatorColor,
  sessionHoursIndicatorFill,
} from './services/classWiseAttendance';
import { buildStudentDashboardView } from './services/studentDashboardData';
import {
  applyApprovedProfileOverrides,
  fetchStudentProfileCorrectionStatus,
  hasApprovedProfileOverrides,
  type StudentProfileCorrection,
} from './services/studentProfileCorrections';
import { isClassWiseOnlySheet } from './services/sheetSelection';
import { isSurveySubmitted, normalizeSurveyStatus, SURVEY_STATUS_COLUMN } from './services/assessmentPerfSheets';
import { adminDataUpdatedAt } from './utils/formatAdminUpdateTime';
import { useMediaQuery } from './hooks/useMediaQuery';
import './styles/StudentDashboard.css';

interface Props {
  email: string;
  onBack: () => void;
}

/** Minimum chart width per session so labels stay readable when scrolling. */
const SESSION_TREND_SLOT_WIDTH = 72;
/** Pre-recorded labels like WK3_VDO2_SWOT_1 need more room than a date. */
const PRE_RECORDED_SLOT_WIDTH = 104;
/** Minimum chart width per quiz bar on narrow screens. */
const QUIZ_SLOT_WIDTH = 108;
const ENDLINE_SURVEY_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSeupoXbv93N3HKOUhLiOFsQtTB-jjQgzYTRU4AbveXgZAcsIA/viewform?usp=header';
type SessionTrendFocus = 'start' | 'latest';
type SessionChartSeries = 'live' | 'prerecorded';

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

function SessionTrendDot(props: {
  cx?: number;
  cy?: number;
  payload?: { value?: number };
  active?: boolean;
  scale?: 'hours' | 'percent';
}) {
  const { cx, cy, payload, active, scale = 'hours' } = props;
  const raw = Number(payload?.value ?? 0);
  if (cx == null || cy == null) return null;

  const labelY = cy - 16;
  const isPercent = scale === 'percent';
  const colorInput = isPercent ? raw / 100 : raw;
  const isFull = isPercent ? raw >= 99.5 : raw >= 1;
  const label = isPercent
    ? (raw >= 99.5 ? '100%' : `${Math.round(raw)}%`)
    : String(raw);

  if (isFull) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={4} fill="#22c55e" stroke="#1e2d45" strokeWidth={1.5} />
        <text x={cx} y={labelY} textAnchor="middle" fontSize={10} fill="var(--sd-text-muted)">{label}</text>
      </g>
    );
  }

  const stroke = sessionHoursIndicatorColor(colorInput);
  const fill = sessionHoursIndicatorFill(colorInput);

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
        {label}
      </text>
    </g>
  );
}

export default function StudentDashboard({ email, onBack }: Props) {
  const { payload, meta } = useUploadedExcel();
  const mapping = (payload?.mapping ?? {}) as ColumnMapping;
  const sessionTrendScrollRef = useRef<HTMLDivElement>(null);
  const sessionChartCaptureRef = useRef<HTMLDivElement>(null);
  const [sessionTrendFocus, setSessionTrendFocus] = useState<SessionTrendFocus>('start');
  const [sessionChartSeries, setSessionChartSeries] = useState<SessionChartSeries>('live');
  const [sessionChartExpanded, setSessionChartExpanded] = useState(false);
  const [quizChartExpanded, setQuizChartExpanded] = useState(false);
  const [approvedCorrection, setApprovedCorrection] = useState<StudentProfileCorrection | null>(null);
  const isMobile = useMediaQuery('(max-width: 640px)');

  useEffect(() => {
    let cancelled = false;
    void fetchStudentProfileCorrectionStatus(email).then(status => {
      if (cancelled) return;
      setApprovedCorrection(status.approved);
    });
    return () => {
      cancelled = true;
    };
  }, [email]);

  const lookup = useMemo(() => lookupStudentByEmail(payload, email), [payload, email]);

  const matched = useMemo(() => {
    if (!lookup) return null;
    return lookup.rawRow ?? studentToDisplayRow(lookup.student);
  }, [lookup]);

  const dataRow = useMemo(() => {
    if (!lookup?.rawRow || !matched) return matched;
    return { ...lookup.rawRow, ...matched };
  }, [lookup, matched]);

  const endlineSurveyStatus = useMemo(() => {
    const raw = (dataRow as Record<string, unknown> | null)?.[SURVEY_STATUS_COLUMN];
    if (raw === undefined || raw === null) return '';
    return normalizeSurveyStatus(String(raw));
  }, [dataRow]);
  const endlineSubmitted = Boolean(endlineSurveyStatus) && isSurveySubmitted(endlineSurveyStatus);

  const classWiseEntry = useMemo(
    () => getClassWiseAttendanceForStudent(payload, email),
    [payload, email],
  );

  const rosterHeaders = useMemo(() => {
    const fromPayload = payload?.headers ?? [];
    const fromRows = payload?.rawRows?.[0] ? Object.keys(payload.rawRows[0]) : [];
    return [...new Set([...fromPayload, ...fromRows])];
  }, [payload]);

  const attendanceOnlyRoster = useMemo(
    () => Boolean(classWiseEntry && isClassWiseOnlySheet(rosterHeaders)),
    [classWiseEntry, rosterHeaders],
  );
  const liveTrendLength = classWiseEntry?.sessions.length ?? 0;
  const preRecordedTrendLength = classWiseEntry?.preRecorded?.length ?? 0;
  const hasPerVideoTrend = Boolean(classWiseEntry?.preRecorded?.some(s => s.key !== 'Pre-recorded'));

  useEffect(() => {
    setSessionTrendFocus('start');
    if (hasPerVideoTrend || (!liveTrendLength && preRecordedTrendLength)) {
      setSessionChartSeries('prerecorded');
    } else {
      setSessionChartSeries('live');
    }
    sessionTrendScrollRef.current?.scrollTo({ left: 0, behavior: 'auto' });
  }, [email, liveTrendLength, preRecordedTrendLength, hasPerVideoTrend]);

  const activeTrendLength = sessionChartSeries === 'live' ? liveTrendLength : preRecordedTrendLength;

  useEffect(() => {
    setSessionTrendFocus('start');
    sessionTrendScrollRef.current?.scrollTo({ left: 0, behavior: 'auto' });
  }, [sessionChartSeries]);

  useEffect(() => {
    const el = sessionTrendScrollRef.current;
    if (!el || activeTrendLength === 0) return;
    const apply = () => {
      const targetLeft = sessionTrendFocus === 'latest'
        ? Math.max(0, el.scrollWidth - el.clientWidth)
        : 0;
      el.scrollTo({ left: targetLeft, behavior: 'smooth' });
    };
    const frame = requestAnimationFrame(apply);
    const timer = window.setTimeout(apply, 150);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [sessionTrendFocus, activeTrendLength, email, sessionChartSeries, isMobile]);

  const dashboardView = useMemo(() => {
    if (!payload || !dataRow || !lookup) return null;
    return buildStudentDashboardView({
      payload,
      email,
      student: lookup.student,
      matched: dataRow,
      mapping,
      classWise: classWiseEntry,
    });
  }, [payload, dataRow, lookup, email, mapping, classWiseEntry]);

  if (!payload || !dataRow || !lookup || !dashboardView) {
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

  const classWise = classWiseEntry;
  const {
    profile,
    attendancePct,
    assignmentSubmissionPct,
    assignmentAcceptancePct,
    avgQuiz,
    quizHighest,
    engagementLabel,
    quizBarData: quizData,
    assignmentRows,
    sessions,
    liveHours,
    preRecordedHours,
    preRecordedAttendancePct,
  } = dashboardView;

  // Show acceptance % as the main Assignments KPI (rejected ≠ full credit).
  const assignmentPct = assignmentAcceptancePct;
  const assignmentSubtitle =
    assignmentSubmissionPct !== assignmentAcceptancePct
      ? `${assignmentSubmissionPct}% submitted · ${assignmentRows.length} items`
      : `${assignmentRows.length} tracked items`;

  const sessionTrend = (classWise ? buildSessionTrendFromClassWise(classWise) : []).map(p => ({
    ...p,
    value: Math.min(100, Math.round(Math.max(0, p.value) * 1000) / 10),
  }));
  const preRecordedTrend = classWise ? buildPreRecordedTrendFromClassWise(classWise) : [];
  const preRecordedVideoCount = (classWise?.preRecorded ?? []).filter(s => s.key !== 'Pre-recorded').length;
  // A single "Pre-recorded" summary total has no per-video hours, so the tab stays blank for it.
  const hasPerVideoHours = preRecordedVideoCount > 0;
  const isPreRecordedSeries = sessionChartSeries === 'prerecorded';
  const activeSessionTrend = !isPreRecordedSeries
    ? sessionTrend
    : hasPerVideoHours ? preRecordedTrend : [];
  const hasLiveTrend = sessionTrend.length > 0;
  const hasPreRecordedTrend = preRecordedTrend.length > 0;
  const hasAnySessionTrend = hasLiveTrend || hasPreRecordedTrend;
  const sessionTrendYMax = sessionChartSeries === 'prerecorded' ? 100 : 115;
  const sessionTrendYLabel = sessionChartSeries === 'prerecorded' ? 'Completion %' : 'Attendance %';
  const sessionTrendSlotWidth = isPreRecordedSeries ? PRE_RECORDED_SLOT_WIDTH : SESSION_TREND_SLOT_WIDTH;
  const sessionTrendChartWidth = Math.max(activeSessionTrend.length * sessionTrendSlotWidth, isMobile ? 300 : 320);
  const sessionTrendNeedsScroll = !isMobile && activeSessionTrend.length > 4;
  const quizChartData = quizData.map(entry => ({
    ...entry,
    chartScore: entry.score ?? 0,
  }));
  const scoredQuizCount = quizData.filter(entry => entry.score != null).length;
  const quizChartWidth = Math.max(quizChartData.length * QUIZ_SLOT_WIDTH, isMobile ? 300 : 320);
  const quizNeedsScroll = !isMobile && quizChartData.length > 3;
  const sessionAxisCompact = isMobile && !sessionChartExpanded;
  const quizAxisCompact = isMobile && !quizChartExpanded;
  const sessionTrendScrollHint = sessionChartSeries === 'live'
    ? `${activeSessionTrend.length} classes · scroll sideways →`
    : `${activeSessionTrend.length} videos · scroll sideways →`;

  const {
    name: studentName,
    id: studentId,
    email: studentEmail,
    phone: rosterPhone,
    course: rosterCourse,
    year: rosterYear,
    cohort,
    college: rosterCollege,
    studentCategory,
  } = profile;
  const baseProfileFields = {
    phone: rosterPhone,
    college: rosterCollege,
    course: rosterCourse,
    year: rosterYear,
  };
  const approvedProfileFields = applyApprovedProfileOverrides(baseProfileFields, approvedCorrection);
  const {
    phone,
    college,
    course: studentCourse,
    year: pursuingYear,
  } = approvedProfileFields;
  const profileUpdatedByAdmin = hasApprovedProfileOverrides(baseProfileFields, approvedCorrection);
  const adminUpdatedAt = adminDataUpdatedAt(meta);

  return (
    <div className="student-page">
      <section className="student-shell">
        <div className="student-notice-strip">
          <ProgramJourneyCard
            classWise={classWise}
            liveSessions={sessions}
            liveHours={liveHours}
            preRecordedHours={preRecordedHours}
            preRecordedAttendancePct={preRecordedAttendancePct}
            livePct={attendancePct}
            assignmentRows={assignmentRows}
            quizBarData={quizData}
            cohortName={
              typeof window !== 'undefined' && window.location.pathname.includes('incubator-14')
                ? 'Incubator 14.0'
                : cohort
            }
            dataAsOf={adminUpdatedAt}
          />
          {attendanceOnlyRoster && (
            <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--sd-text-muted)', lineHeight: 1.5 }}>
              Attendance and sessions are up to date. Assignment and quiz scores will appear after your admin re-publishes
              the main performance sheet (not the Class-wise Attendance sheet only).
            </p>
          )}
        </div>
        <header className="student-header">
          <BrandBanner
            className="student-header__brand"
            title="VigyanShaala Performance Dashboard"
            subtitle="Live sessions, pre-recorded hours, quizzes and assignments"
          />
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
          {profileUpdatedByAdmin && (
            <p className="profile-edit-panel__msg" style={{ margin: '8px 0 0' }}>
              Profile details above include your latest admin-approved update. Excel sync may still show older values until the next upload.
            </p>
          )}
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
          <StudentProfileEditPanel
            email={studentEmail}
            studentName={studentName}
            current={{
              phone,
              college,
              course: studentCourse,
              year: pursuingYear,
            }}
          />
        </header>

        <div className="section-body">
          <div className="stat-row">
            <StatCard
              label="Live sessions"
              value={`${attendancePct.toFixed(2)}%`}
              subtitle={sessions > 0 ? `${sessions} live classes so far` : 'No live dates yet'}
              warn={attendancePct === 0}
            />
            <StatCard
              label="Pre-recorded"
              value={`${preRecordedAttendancePct.toFixed(2)}%`}
              subtitle={preRecordedAttendancePct > 0 || preRecordedHours > 0
                ? (preRecordedVideoCount ? `${preRecordedVideoCount} videos so far` : 'Pre-recorded videos')
                : 'No pre-recorded watch time yet'}
              warn={preRecordedAttendancePct === 0 && preRecordedHours === 0}
            />
            <div className={`metric-alert-wrap ${assignmentPct === 0 ? 'metric-alert-wrap--hot' : ''}`}>
              <StatCard label="Assignments" value={`${assignmentPct}%`} subtitle={assignmentSubtitle} warn={assignmentPct === 0} />
              <AnimeMetricAlert
                variant="assignment"
                show={assignmentPct === 0}
                label="Assignments"
                message="Pending work detected! Complete your assignments to boost your score."
              />
            </div>
            <div className={`metric-alert-wrap ${avgQuiz === 0 ? 'metric-alert-wrap--hot' : ''}`}>
              <StatCard label="Avg Quiz Score" value={`${avgQuiz}%`} subtitle={quizData.length ? 'From quiz columns' : 'No quiz data'} warn={avgQuiz === 0} />
              <AnimeMetricAlert
                variant="quiz"
                show={avgQuiz === 0}
                label="Quizzes"
                message="No quiz scores yet. Attempt quizzes when they open — they count toward your profile!"
              />
            </div>
          </div>

          {endlineSurveyStatus && (
            <section className={`endline-survey-card${endlineSubmitted ? '' : ' endline-survey-card--pending'}`}>
              <div>
                <h3>Endline survey</h3>
                <span className="endline-survey-status">{endlineSurveyStatus}</span>
                {!endlineSubmitted && (
                  <p className="endline-survey-note">
                    Take a minute to think about your background and the opportunities given to you, and frame your answers accordingly.
                  </p>
                )}
              </div>
              <a className="endline-survey-link" href={ENDLINE_SURVEY_URL} target="_blank" rel="noopener noreferrer">
                {endlineSubmitted ? 'View survey' : 'Fill endline survey'}
              </a>
            </section>
          )}

          <div className="charts-grid">
            <article className="panel-card panel-large session-trend-panel panel-card-wrap">
              <ChartDataUpdatedBubble updatedAt={adminUpdatedAt} chartKey="sessions" delayMs={1200} />
              <h3>Session-wise trend</h3>
              {hasAnySessionTrend && (
                <div className="session-trend-controls" role="group" aria-label="Session chart options">
                  <div className="session-trend-view-toggle session-trend-series-toggle">
                    <button
                      type="button"
                      className={`session-trend-toggle-btn${sessionChartSeries === 'prerecorded' ? ' active' : ''}`}
                      onClick={() => setSessionChartSeries('prerecorded')}
                      onMouseEnter={() => setSessionChartSeries('prerecorded')}
                      aria-pressed={sessionChartSeries === 'prerecorded'}
                    >
                      Pre-recorded videos
                    </button>
                    <button
                      type="button"
                      className={`session-trend-toggle-btn${sessionChartSeries === 'live' ? ' active' : ''}`}
                      onClick={() => setSessionChartSeries('live')}
                      onMouseEnter={() => { if (hasLiveTrend) setSessionChartSeries('live'); }}
                      aria-pressed={sessionChartSeries === 'live'}
                      disabled={!hasLiveTrend}
                    >
                      Live classes
                    </button>
                  </div>
                  {activeSessionTrend.length > 0 && (
                    <ChartSnapshotActions
                      chartRootRef={sessionChartCaptureRef}
                      disabled={activeSessionTrend.length === 0}
                      fileName={`session-wise-${sessionChartSeries}-${studentName.replace(/\s+/g, '-').toLowerCase() || 'chart'}.png`}
                      meta={{
                        title: `Session-wise trend · ${sessionChartSeries === 'live' ? 'Live classes' : 'Pre-recorded videos'}`,
                        subtitle: [studentName !== '—' ? studentName : '', studentEmail !== '—' ? studentEmail : '']
                          .filter(Boolean)
                          .join(' · ') || undefined,
                        footer: `VigyanShaala · ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`,
                      }}
                    />
                  )}
                  <span className="session-trend-guideline">
                    {isPreRecordedSeries
                      ? 'Watch every video in full · no skipping · max 1.5x speed to get credit.'
                      : 'Attend live classes in full · missed one? Watch its recording fully, no skipping, max 1.5x speed.'}
                  </span>
                  {isPreRecordedSeries && (
                    <span className="session-trend-scroll-hint session-trend-explainer">
                      {hasPerVideoHours
                        ? 'WK# is the program week and VDO# is the video number. Each bar is your watch-time % for that video: green is fully watched, red is not watched.'
                        : 'Individual pre-recorded video hours are not available yet.'}
                    </span>
                  )}
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
              {isPreRecordedSeries && !hasPerVideoHours ? (
                <div className="session-trend-vacant">
                  This view stays blank until each pre-recorded video has its own hours. Quiz scores are in the chart below.
                </div>
              ) : activeSessionTrend.length > 0 ? (
                <div ref={sessionChartCaptureRef} className="session-trend-capture-root">
                  <ChartMobileFrame
                    chartKey="sessions"
                    height={isPreRecordedSeries && !sessionAxisCompact ? 290 : 240}
                    needsHorizontalScroll={sessionTrendNeedsScroll}
                    innerWidth={sessionTrendChartWidth}
                    scrollRef={sessionTrendScrollRef}
                    showScrollLadder={sessionTrendNeedsScroll}
                    onExpandedChange={setSessionChartExpanded}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                        {isPreRecordedSeries ? (
                          <BarChart data={activeSessionTrend} margin={{ top: 18, right: 8, left: sessionAxisCompact ? 0 : 24, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--sd-border)" vertical={false} />
                            <XAxis
                              dataKey="name"
                              stroke="var(--sd-text-muted)"
                              fontSize={sessionAxisCompact ? 9 : 10}
                              interval={sessionAxisCompact ? 'preserveStartEnd' : 0}
                              angle={sessionAxisCompact ? 0 : -30}
                              textAnchor={sessionAxisCompact ? 'middle' : 'end'}
                              height={sessionAxisCompact ? 28 : 84}
                            />
                            <YAxis
                              domain={[0, 100]}
                              stroke="var(--sd-text-muted)"
                              fontSize={11}
                              width={sessionAxisCompact ? 28 : 48}
                              tickFormatter={v => `${v}%`}
                              label={sessionAxisCompact ? undefined : { value: 'Watch-time %', angle: -90, position: 'insideLeft', fontSize: 11, fill: 'var(--sd-text-muted)' }}
                            />
                            <Tooltip
                              cursor={{ fill: 'rgba(44, 72, 105, 0.06)' }}
                              contentStyle={{ background: '#fff', border: '1px solid #e3e7ef', color: '#223D62' }}
                              formatter={value => [`${Number(value ?? 0).toFixed(1)}%`, 'Watch-time']}
                            />
                            <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={sessionAxisCompact ? undefined : 40}>
                              {activeSessionTrend.map((point, idx) => (
                                <Cell key={`${point.name}-${idx}`} fill={sessionHoursIndicatorColor(point.value / 100)} />
                              ))}
                              {!sessionAxisCompact && (
                                <LabelList
                                  dataKey="value"
                                  position="top"
                                  fontSize={11}
                                  fill="var(--sd-text)"
                                  formatter={(v: unknown) => `${Math.round(Number(v ?? 0))}%`}
                                />
                              )}
                            </Bar>
                          </BarChart>
                        ) : (
                          <LineChart data={activeSessionTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--sd-border)" />
                            <XAxis
                              dataKey="name"
                              stroke="var(--sd-text-muted)"
                              fontSize={sessionAxisCompact ? 9 : 10}
                              interval={sessionAxisCompact ? 'preserveStartEnd' : 0}
                              angle={sessionAxisCompact ? 0 : -25}
                              textAnchor={sessionAxisCompact ? 'middle' : 'end'}
                              height={sessionAxisCompact ? 28 : 56}
                            />
                            <YAxis
                              domain={[0, sessionTrendYMax]}
                              ticks={[0, 25, 50, 75, 100]}
                              tickFormatter={v => `${v}%`}
                              stroke="var(--sd-text-muted)"
                              fontSize={11}
                              width={sessionAxisCompact ? 28 : 48}
                              label={sessionAxisCompact ? undefined : { value: sessionTrendYLabel, angle: -90, position: 'insideLeft', fontSize: 11, fill: 'var(--sd-text-muted)' }}
                            />
                            <Tooltip
                              contentStyle={{ background: '#fff', border: '1px solid #e3e7ef', color: '#223D62' }}
                              formatter={(value, _name, item) => {
                                const point = (item?.payload ?? {}) as { kind?: string };
                                const pct = Number(value ?? 0);
                                const label = point.kind === 'live' || pct >= 100
                                  ? 'Live attended'
                                  : pct > 0
                                    ? 'Recording watched'
                                    : 'Missed';
                                return [`${Math.round(pct)}%`, label];
                              }}
                            />
                            <Line
                              type="monotone"
                              dataKey="value"
                              stroke="var(--sd-primary)"
                              strokeWidth={2.5}
                              dot={(props) => <SessionTrendDot {...props} scale="percent" />}
                              activeDot={(props) => <SessionTrendDot {...props} scale="percent" active />}
                            />
                          </LineChart>
                        )}
                      </ResponsiveContainer>
                  </ChartMobileFrame>
                </div>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--sd-text-muted)', margin: '24px 0', lineHeight: 1.6 }}>
                  No attendance dates for this student yet. Re-upload the workbook with the Overall Attendance sheet.
                </p>
              )}
            </article>
            <article className="panel-card panel-large panel-card-wrap">
              <ChartDataUpdatedBubble updatedAt={adminUpdatedAt} chartKey="quiz" delayMs={600} />
              <h3>Quiz performance</h3>
              {quizChartData.length === 0 ? (
                <div style={{ padding: '32px 12px', textAlign: 'center', color: 'var(--sd-text-muted)', fontSize: 13 }}>
                  No quiz scores yet
                </div>
              ) : (
                <ChartMobileFrame
                  chartKey="quiz"
                  height={220}
                  needsHorizontalScroll={quizNeedsScroll}
                  innerWidth={quizChartWidth}
                  showScrollLadder={quizNeedsScroll}
                  onExpandedChange={setQuizChartExpanded}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={quizChartData} margin={{ top: 12, right: 8, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--sd-border)" />
                      <XAxis
                        dataKey="name"
                        stroke="var(--sd-text-muted)"
                        fontSize={quizAxisCompact ? 9 : 11}
                        interval={quizAxisCompact ? 'preserveStartEnd' : 0}
                        angle={0}
                        textAnchor="middle"
                        height={quizAxisCompact ? 32 : 30}
                        tickFormatter={value => {
                          const text = String(value ?? '');
                          const limit = quizAxisCompact ? 10 : 26;
                          return text.length > limit ? `${text.slice(0, limit)}...` : text;
                        }}
                      />
                      <YAxis domain={[0, 100]} stroke="var(--sd-text-muted)" fontSize={11} width={isMobile ? 28 : 36} />
                      <Tooltip
                        contentStyle={{ background: '#fff', border: '1px solid #e3e7ef', color: '#223D62' }}
                        formatter={(value, _name, item) => {
                          const row = item.payload as { display?: string; score?: number | null };
                          return [row.display ?? value, 'Score'];
                        }}
                      />
                      <Bar dataKey="chartScore" radius={[6, 6, 0, 0]} barSize={quizAxisCompact ? undefined : 48}>
                        {quizChartData.map((entry, idx) => (
                          <Cell
                            key={`${entry.name}-${idx}`}
                            fill={
                              entry.score == null
                                ? 'var(--sd-border)'
                                : entry.score >= 100
                                  ? 'var(--sd-light-green)'
                                  : 'var(--sd-accent)'
                            }
                          />
                        ))}
                        {!quizAxisCompact && (
                          <LabelList
                            dataKey="display"
                            position="top"
                            fontSize={11}
                            fill="var(--sd-text)"
                          />
                        )}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartMobileFrame>
              )}
              <div className="quiz-summary">
                <MiniStat label="Average" value={`${avgQuiz}%`} />
                <MiniStat label="Highest" value={`${quizHighest}%`} />
                <MiniStat label="Count" value={String(scoredQuizCount || quizChartData.length)} />
              </div>
            </article>

            <article className="panel-card panel-large panel-card-wrap">
              <ChartDataUpdatedBubble updatedAt={adminUpdatedAt} chartKey="assignments" delayMs={900} />
              <h3>Assignments</h3>
              <div className="assignment-list">
                {assignmentRows.map(item => {
                  if (isAssignmentCommentColumn(item.name)) return null;
                  const display = resolveAssignmentDisplayFields(item);
                  const explanation = getAssignmentStatusExplanation(display.kind, Boolean(display.feedbackText));
                  const statusClass =
                    display.kind === 'accepted'
                      ? 'accepted'
                      : display.kind === 'rejected'
                        ? 'rejected'
                        : display.kind === 'pending'
                          ? 'pending'
                          : '';
                  return (
                    <div className="assignment-block" key={item.name}>
                      <div className="assignment-row">
                        <div className="assignment-name-wrap">
                          <div className="assignment-name">{item.name}</div>
                          <div className="assignment-date">{item.date}</div>
                        </div>
                        <span className={`status-pill ${statusClass}`} title={display.statusLabel}>
                          {display.statusLabel}
                        </span>
                      </div>
                      {explanation && (
                        <div className={`assignment-explainer assignment-explainer--${display.kind}`}>
                          {explanation}
                        </div>
                      )}
                      {display.kind === 'rejected' && (
                        <ol className="assignment-action-steps">
                          {REJECTED_ASSIGNMENT_STEPS.map(step => (
                            <li key={step}>{step}</li>
                          ))}
                        </ol>
                      )}
                      {display.feedbackText && (
                        <div className={`assignment-feedback assignment-feedback--${display.kind}`}>
                          <div className="assignment-feedback__label">Facilitator feedback — scroll to read all</div>
                          <div className="assignment-feedback__scroll" tabIndex={0}>
                            {display.feedbackText}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
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

