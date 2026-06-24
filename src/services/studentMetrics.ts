import type {
  ChartDataPoint,
  CohortMetric,
  RiskCategory,
  RiskStudent,
  RiskType,
  Student,
  WeeklyChange,
  WeeklyMovement,
} from '../types/adminTypes';

/** Single source of truth — matches PROJECT_REQUIREMENTS.md */
export const METRIC_WEIGHTS = {
  attendance: 0.4,
  assignment: 0.3,
  quiz: 0.3,
} as const;

export const ENGAGEMENT_CATEGORY_THRESHOLDS = {
  excellent: 90,
  good: 75,
  needsAttention: 60,
} as const;

export interface RawStudentRow {
  id: string;
  student_id?: string | null;
  name?: string | null;
  email?: string | null;
  status?: string | null;
  state?: string | null;
  college_id?: string | null;
  current_cohort_id?: string | null;
  current_program_id?: string | null;
  certificate_status?: string | null;
}

export interface StudentMetrics {
  attendance: number;
  assignmentCompletion: number;
  quizAverage: number;
  engagementScore: number;
  riskCategory: RiskCategory;
  riskScore: number;
}

export function roundPct(value: number): number {
  return Math.min(100, Math.round(value));
}

export function average(values: number[]): number {
  if (!values.length) return 0;
  return roundPct(values.reduce((a, b) => a + b, 0) / values.length);
}

export function computeAttendancePct(studentHours: number, cohortTotalHours: number): number {
  if (cohortTotalHours <= 0) return 0;
  return roundPct((studentHours / cohortTotalHours) * 100);
}

/** Wide-format imports store attendance % directly in hours_attended (0–100) with a 100h session sentinel. */
export function isWideFormatAttendance(
  studentHours: number,
  cohortTotalHours: number,
  attendanceRecordCount: number,
): boolean {
  return (
    cohortTotalHours > 0 &&
    cohortTotalHours <= 100 &&
    attendanceRecordCount > 0 &&
    attendanceRecordCount <= 3 &&
    studentHours >= 0 &&
    studentHours <= 100
  );
}

export interface StudentMetricInput {
  studentHours: number;
  cohortTotalHours: number;
  submittedAssignments: number;
  totalAssignments: number;
  quizScores: number[];
  quizPercentages?: number[];
  /** Rows in attendance_records for this student */
  attendanceRecordCount?: number;
  /** Records with attended=true or hours_attended > 0 */
  attendedRecordCount?: number;
  /** Total assignment_submission rows (fallback denominator) */
  studentSubmissionTotal?: number;
  /** From Excel import (engagement_metrics / wide-format) — preferred when set */
  importedAttendancePct?: number;
  importedAssignmentPct?: number;
  importedQuizPct?: number;
}

export function resolveAttendancePct(input: StudentMetricInput): number {
  const recordCount = input.attendanceRecordCount ?? 0;
  const attendedCount = input.attendedRecordCount ?? 0;
  const { studentHours, cohortTotalHours } = input;

  if (cohortTotalHours > 0) {
    if (isWideFormatAttendance(studentHours, cohortTotalHours, recordCount)) {
      return roundPct(studentHours);
    }
    const hoursBased = computeAttendancePct(studentHours, cohortTotalHours);
    if (hoursBased > 0) return hoursBased;
    if (studentHours > 0 && studentHours <= 100) return roundPct(studentHours);
    if (studentHours === 0) return 0;
  }

  // Wide-format without cohort session rollup: hours_attended is already a %
  if (recordCount > 0 && studentHours > 0 && studentHours <= 100) {
    return roundPct(studentHours);
  }

  // Session-count fallback (matches student_performance_summary matview)
  if (recordCount > 0) {
    return roundPct((attendedCount / recordCount) * 100);
  }

  return 0;
}

export function resolveAssignmentPct(input: StudentMetricInput): number {
  if (input.totalAssignments > 0) {
    return computeAssignmentPct(input.submittedAssignments, input.totalAssignments);
  }
  const submissionTotal = input.studentSubmissionTotal ?? 0;
  if (submissionTotal > 0) {
    return computeAssignmentPct(input.submittedAssignments, submissionTotal);
  }
  return 0;
}

export function computeAssignmentPct(submittedCount: number, totalAssignments: number): number {
  if (totalAssignments <= 0) return 0;
  return roundPct((submittedCount / totalAssignments) * 100);
}

export function computeQuizAveragePct(scores: number[], percentages?: number[]): number {
  const values = percentages?.length ? percentages : scores;
  if (!values.length) return 0;
  return roundPct(values.reduce((a, b) => a + b, 0) / values.length);
}

export function computeEngagementScore(
  attendance: number,
  assignmentCompletion: number,
  quizAverage: number,
): number {
  return roundPct(
    attendance * METRIC_WEIGHTS.attendance +
      assignmentCompletion * METRIC_WEIGHTS.assignment +
      quizAverage * METRIC_WEIGHTS.quiz,
  );
}

export function computeRiskCategory(engagementScore: number): RiskCategory {
  if (engagementScore >= ENGAGEMENT_CATEGORY_THRESHOLDS.excellent) return 'Excellent';
  if (engagementScore >= ENGAGEMENT_CATEGORY_THRESHOLDS.good) return 'Good';
  if (engagementScore >= ENGAGEMENT_CATEGORY_THRESHOLDS.needsAttention) return 'Needs Attention';
  return 'At Risk';
}

export function computeRiskScore(engagementScore: number): number {
  return Math.max(0, 100 - engagementScore);
}

export function computeStudentMetrics(input: StudentMetricInput): StudentMetrics {
  const computedAttendance = resolveAttendancePct(input);
  const computedAssignment = resolveAssignmentPct(input);
  const computedQuiz = computeQuizAveragePct(input.quizScores, input.quizPercentages);

  const attendance =
    input.importedAttendancePct != null
      ? roundPct(input.importedAttendancePct)
      : computedAttendance;
  const assignmentCompletion =
    input.importedAssignmentPct !== undefined
      ? roundPct(input.importedAssignmentPct)
      : computedAssignment;
  const quizAverage =
    input.importedQuizPct !== undefined
      ? roundPct(input.importedQuizPct)
      : computedQuiz;

  const engagementScore = computeEngagementScore(attendance, assignmentCompletion, quizAverage);
  const riskCategory = computeRiskCategory(engagementScore);
  return {
    attendance,
    assignmentCompletion,
    quizAverage,
    engagementScore,
    riskCategory,
    riskScore: computeRiskScore(engagementScore),
  };
}

export function buildStudentRecord(
  raw: RawStudentRow,
  names: {
    college: string;
    cohort: string;
    program: string;
  },
  metrics: StudentMetrics,
): Student {
  return {
    id: raw.id,
    name: raw.name ?? '',
    email: raw.email ?? '',
    college: names.college,
    cohort: names.cohort,
    program: names.program,
    state: raw.state ?? '',
    attendance: metrics.attendance,
    assignmentCompletion: metrics.assignmentCompletion,
    quizAverage: metrics.quizAverage,
    engagementScore: metrics.engagementScore,
    riskCategory: metrics.riskCategory,
    status: (raw.status as Student['status']) ?? 'Active',
    riskScore: metrics.riskScore,
    certificateStatus: raw.certificate_status ?? '',
  };
}

/* ── Intervention risk (8-category rules subset used in UI) ── */

export function suggestedActionFor(riskType: RiskType): string {
  switch (riskType) {
    case 'Low Attendance':
      return 'Schedule 1:1 mentor call to discuss session blockers.';
    case 'Assignment Backlog':
      return 'Send assignment reminder and offer catch-up plan.';
    case 'Low Quiz Performance':
      return 'Recommend revision sessions and recorded lecture review.';
    case 'Attend But Not Submit':
      return 'Mentor follow up — likely struggling with submission workflow.';
    case 'Submit But Low Attendance':
      return 'Confirm timing conflicts; offer recorded session access.';
    case 'High Risk':
      return 'Immediate intervention — escalate to program manager.';
    default:
      return 'Mentor follow-up required.';
  }
}

export function classifyInterventionRisk(
  s: Pick<Student, 'attendance' | 'assignmentCompletion' | 'quizAverage'>,
): RiskType | null {
  const { attendance: att, assignmentCompletion: asn, quizAverage: qz } = s;
  if (att < 60 && asn < 40 && qz < 40) return 'High Risk';
  if (att > 80 && asn < 40) return 'Attend But Not Submit';
  if (asn > 80 && att < 60) return 'Submit But Low Attendance';
  if (att < 70) return 'Low Attendance';
  if (asn < 50) return 'Assignment Backlog';
  if (qz < 50) return 'Low Quiz Performance';
  return null;
}

export function buildRiskStudents(students: Student[]): RiskStudent[] {
  return students
    .map(s => {
      const riskType = classifyInterventionRisk(s);
      if (!riskType) return null;
      return {
        studentId: s.id,
        name: s.name,
        email: s.email,
        cohort: s.cohort,
        college: s.college,
        riskType,
        attendance: s.attendance,
        assignmentCompletion: s.assignmentCompletion,
        quizAverage: s.quizAverage,
        riskScore: s.riskScore,
        suggestedAction: suggestedActionFor(riskType),
      } satisfies RiskStudent;
    })
    .filter((r): r is RiskStudent => r !== null);
}

/* ── Chart aggregations from computed students ── */

export function attendanceDistribution(students: Student[]): ChartDataPoint[] {
  const buckets = [
    { name: '0-25%', value: 0 },
    { name: '25-50%', value: 0 },
    { name: '50-75%', value: 0 },
    { name: '75-100%', value: 0 },
  ];
  for (const s of students) {
    if (s.attendance < 25) buckets[0].value++;
    else if (s.attendance < 50) buckets[1].value++;
    else if (s.attendance < 75) buckets[2].value++;
    else buckets[3].value++;
  }
  return buckets;
}

export function quizScoreDistribution(students: Student[]): ChartDataPoint[] {
  const buckets = [
    { name: '0-20', value: 0 },
    { name: '21-40', value: 0 },
    { name: '41-60', value: 0 },
    { name: '61-80', value: 0 },
    { name: '81-100', value: 0 },
  ];
  for (const s of students) {
    const q = s.quizAverage;
    if (q <= 20) buckets[0].value++;
    else if (q <= 40) buckets[1].value++;
    else if (q <= 60) buckets[2].value++;
    else if (q <= 80) buckets[3].value++;
    else buckets[4].value++;
  }
  return buckets;
}

export function averageByGroup(
  students: Student[],
  groupKey: keyof Pick<Student, 'college' | 'cohort'>,
  valueKey: keyof Pick<Student, 'attendance' | 'assignmentCompletion' | 'quizAverage'>,
): ChartDataPoint[] {
  const groups = new Map<string, number[]>();
  for (const s of students) {
    const key = s[groupKey];
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s[valueKey] as number);
  }
  return [...groups.entries()]
    .map(([name, vals]) => ({ name, value: average(vals) }))
    .sort((a, b) => b.value - (a.value as number));
}

export function cohortComparisonBars(
  students: Student[],
  valueKey: keyof Pick<Student, 'attendance' | 'assignmentCompletion' | 'quizAverage'>,
  previousByCohort: Map<string, number>,
): ChartDataPoint[] {
  const groups = new Map<string, number[]>();
  for (const s of students) {
    if (!s.cohort) continue;
    if (!groups.has(s.cohort)) groups.set(s.cohort, []);
    groups.get(s.cohort)!.push(s[valueKey] as number);
  }
  return [...groups.entries()].map(([name, vals]) => {
    const current = average(vals);
    return {
      name,
      value: current,
      current,
      previous: previousByCohort.get(name) ?? current,
    };
  });
}

export function buildCohortMetricsTable(students: Student[]): CohortMetric[] {
  const groups = new Map<string, Student[]>();
  for (const s of students) {
    if (!s.cohort) continue;
    if (!groups.has(s.cohort)) groups.set(s.cohort, []);
    groups.get(s.cohort)!.push(s);
  }
  return [...groups.entries()]
    .map(([cohort, cohortStudents]) => ({
      cohort,
      totalStudents: cohortStudents.length,
      attendance: average(cohortStudents.map(s => s.attendance)),
      assignmentCompletion: average(cohortStudents.map(s => s.assignmentCompletion)),
      quizAverage: average(cohortStudents.map(s => s.quizAverage)),
      engagementScore: average(cohortStudents.map(s => s.engagementScore)),
      atRisk: cohortStudents.filter(s => s.riskCategory === 'At Risk').length,
      topPerformers: cohortStudents.filter(s => s.riskCategory === 'Excellent').length,
    }))
    .sort((a, b) => a.cohort.localeCompare(b.cohort));
}

export interface KPISummary {
  totalStudents: number;
  activeStudents: number;
  atRiskStudents: number;
  avgAttendance: number;
  avgAssignment: number;
  avgQuiz: number;
  avgEngagement: number;
  topPerformers: number;
}

export function buildKPISummary(students: Student[]): KPISummary {
  return {
    totalStudents: students.length,
    activeStudents: students.filter(s => s.status === 'Active').length,
    atRiskStudents: students.filter(s => s.riskCategory === 'At Risk').length,
    avgAttendance: average(students.map(s => s.attendance)),
    avgAssignment: average(students.map(s => s.assignmentCompletion)),
    avgQuiz: average(students.map(s => s.quizAverage)),
    avgEngagement: average(students.map(s => s.engagementScore)),
    topPerformers: students.filter(s => s.riskCategory === 'Excellent').length,
  };
}

/* ── Time-based helpers ── */

export function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? 6 : day - 1;
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function parseISODate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s.includes('T') ? s : `${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isDateInRange(d: Date, start: Date, end: Date): boolean {
  return d >= start && d < end;
}

export interface SessionRow {
  id: string;
  cohort_id: string;
  session_date: string;
  duration_hours: number;
}

export interface AttendanceRow {
  student_id: string;
  session_id: string;
  hours_attended: number;
  attended?: boolean;
}

export interface SubmissionRow {
  student_id: string;
  status: string;
  submitted_at?: string | null;
}

export interface QuizResultRow {
  student_id: string;
  score: number;
  percentage: number;
  taken_at?: string | null;
}

export function computeWeekBounds(weeksAgo: number): { start: Date; end: Date } {
  const now = new Date();
  const thisWeekStart = startOfWeek(now);
  const start = new Date(thisWeekStart);
  start.setDate(start.getDate() - weeksAgo * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

export function programAttendanceForWeek(
  students: Student[],
  studentCohortUuid: Map<string, string>,
  sessions: SessionRow[],
  attendance: AttendanceRow[],
  weekStart: Date,
  weekEnd: Date,
): number {
  const sessionIdsInWeek = new Set(
    sessions
      .filter(s => {
        const d = parseISODate(s.session_date);
        return d && isDateInRange(d, weekStart, weekEnd);
      })
      .map(s => s.id),
  );
  if (!sessionIdsInWeek.size) return 0;

  const sessionById = new Map(sessions.map(s => [s.id, s]));
  const pcts: number[] = [];

  for (const student of students) {
    const cohortId = studentCohortUuid.get(student.id);
    if (!cohortId) continue;
    let totalHours = 0;
    let attendedHours = 0;
    for (const sid of sessionIdsInWeek) {
      const sess = sessionById.get(sid);
      if (!sess || sess.cohort_id !== cohortId) continue;
      totalHours += sess.duration_hours ?? 0;
    }
    if (totalHours <= 0) continue;
    for (const ar of attendance) {
      if (ar.student_id !== student.id || !sessionIdsInWeek.has(ar.session_id)) continue;
      attendedHours += ar.hours_attended ?? 0;
    }
    pcts.push(computeAttendancePct(attendedHours, totalHours));
  }
  return average(pcts);
}

export function buildWeeklyTrend(
  students: Student[],
  studentCohortUuid: Map<string, string>,
  sessions: SessionRow[],
  attendance: AttendanceRow[],
  submissions: SubmissionRow[],
  quizResults: QuizResultRow[],
  weekCount = 10,
): ChartDataPoint[] {
  const points: ChartDataPoint[] = [];
  for (let w = weekCount - 1; w >= 0; w--) {
    const { start, end } = computeWeekBounds(w);
    const label = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const attendancePct = programAttendanceForWeek(
      students,
      studentCohortUuid,
      sessions,
      attendance,
      start,
      end,
    );

    const subsInWeek = submissions.filter(s => {
      if (!s.submitted_at || s.status === 'Pending') return false;
      const d = parseISODate(s.submitted_at);
      return d && isDateInRange(d, start, end);
    });
    const assignmentPct =
      submissions.length > 0
        ? roundPct((subsInWeek.length / submissions.length) * 100)
        : average(students.map(s => s.assignmentCompletion));

    const quizzesInWeek = quizResults.filter(q => {
      const d = parseISODate(q.taken_at ?? '');
      return d && isDateInRange(d, start, end);
    });
    const quizPct =
      quizzesInWeek.length > 0
        ? roundPct(
            quizzesInWeek.reduce((sum, q) => sum + (q.percentage ?? q.score ?? 0), 0) /
              quizzesInWeek.length,
          )
        : average(students.map(s => s.quizAverage));

    points.push({
      name: label,
      value: attendancePct,
      attendance: attendancePct,
      assignment: assignmentPct,
      quiz: quizPct,
    });
  }
  return points;
}

export function buildMonthlyTrend(
  students: Student[],
  studentCohortUuid: Map<string, string>,
  sessions: SessionRow[],
  attendance: AttendanceRow[],
  monthCount = 6,
): ChartDataPoint[] {
  const points: ChartDataPoint[] = [];
  const now = new Date();
  for (let m = monthCount - 1; m >= 0; m--) {
    const start = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - m + 1, 1);
    const label = start.toLocaleDateString('en-US', { month: 'short' });
    const att = programAttendanceForWeek(students, studentCohortUuid, sessions, attendance, start, end);
    points.push({
      name: label,
      value: att,
      attendance: att,
      assignment: average(students.map(s => s.assignmentCompletion)),
      quiz: average(students.map(s => s.quizAverage)),
    });
  }
  return points;
}

export function previousWeekMetricsByCohort(
  students: Student[],
  studentCohortUuid: Map<string, string>,
  sessions: SessionRow[],
  attendance: AttendanceRow[],
): Map<string, number> {
  const { start, end } = computeWeekBounds(1);
  const out = new Map<string, number>();
  const cohortNames = new Map<string, string>();
  for (const s of students) {
    const cid = studentCohortUuid.get(s.id);
    if (cid && s.cohort) cohortNames.set(cid, s.cohort);
  }
  for (const [cohortId, cohortName] of cohortNames) {
    const cohortStudents = students.filter(s => studentCohortUuid.get(s.id) === cohortId);
    const pcts = cohortStudents.map(st => {
      let total = 0;
      let attended = 0;
      for (const sess of sessions) {
        const d = parseISODate(sess.session_date);
        if (!d || !isDateInRange(d, start, end) || sess.cohort_id !== cohortId) continue;
        total += sess.duration_hours ?? 0;
      }
      if (total <= 0) return 0;
      for (const ar of attendance) {
        if (ar.student_id !== st.id) continue;
        const sess = sessions.find(x => x.id === ar.session_id);
        if (!sess) continue;
        const d = parseISODate(sess.session_date);
        if (d && isDateInRange(d, start, end)) attended += ar.hours_attended ?? 0;
      }
      return computeAttendancePct(attended, total);
    });
    out.set(cohortName, average(pcts));
  }
  return out;
}

export function assignmentStatusDistribution(
  submissions: SubmissionRow[],
): ChartDataPoint[] {
  let submitted = 0;
  let pending = 0;
  let late = 0;
  for (const s of submissions) {
    if (s.status === 'Late Submission') late++;
    else if (s.status === 'Pending') pending++;
    else submitted++;
  }
  return [
    { name: 'Submitted', value: submitted },
    { name: 'Pending', value: pending },
    { name: 'Late', value: late },
  ];
}

export function quizParticipationDistribution(
  students: Student[],
  quizResults: QuizResultRow[],
  quizCountByCohort: Map<string, number>,
  studentCohortUuid: Map<string, string>,
): ChartDataPoint[] {
  let attempted = 0;
  let notAttempted = 0;
  for (const s of students) {
    const cohortId = studentCohortUuid.get(s.id);
    const totalQuizzes = cohortId ? quizCountByCohort.get(cohortId) ?? 0 : 0;
    const studentAttempts = quizResults.filter(q => q.student_id === s.id).length;
    if (totalQuizzes > 0 ? studentAttempts > 0 : studentAttempts > 0) attempted++;
    else notAttempted++;
  }
  return [
    { name: 'Attempted', value: attempted },
    { name: 'Not Attempted', value: notAttempted },
  ];
}

export function buildWeeklyChanges(
  students: Student[],
  studentCohortUuid: Map<string, string>,
  sessions: SessionRow[],
  attendance: AttendanceRow[],
  submissions: SubmissionRow[],
  quizResults: QuizResultRow[],
  quizCountByCohort: Map<string, number>,
): WeeklyChange[] {
  const currentWeek = computeWeekBounds(0);
  const prevWeek = computeWeekBounds(1);
  const curAtt = programAttendanceForWeek(
    students,
    studentCohortUuid,
    sessions,
    attendance,
    currentWeek.start,
    currentWeek.end,
  );
  const prevAtt = programAttendanceForWeek(
    students,
    studentCohortUuid,
    sessions,
    attendance,
    prevWeek.start,
    prevWeek.end,
  );
  const kpi = buildKPISummary(students);
  const curWeekSubs = submissions.filter(s => {
    if (!s.submitted_at || s.status === 'Pending') return false;
    const d = parseISODate(s.submitted_at);
    return d && isDateInRange(d, currentWeek.start, currentWeek.end);
  });
  const prevWeekSubs = submissions.filter(s => {
    if (!s.submitted_at || s.status === 'Pending') return false;
    const d = parseISODate(s.submitted_at);
    return d && isDateInRange(d, prevWeek.start, prevWeek.end);
  });
  const curAsnPct =
    submissions.length > 0
      ? roundPct((curWeekSubs.length / submissions.length) * 100)
      : kpi.avgAssignment;
  const prevAsnPct =
    submissions.length > 0
      ? roundPct((prevWeekSubs.length / submissions.length) * 100)
      : kpi.avgAssignment;

  const participation = quizParticipationDistribution(
    students,
    quizResults,
    quizCountByCohort,
    studentCohortUuid,
  );
  const attempted = participation.find(p => p.name === 'Attempted')?.value ?? 0;
  const total = students.length || 1;
  const partPct = roundPct((Number(attempted) / total) * 100);

  return [
    {
      metric: 'Attendance',
      current: curAtt || kpi.avgAttendance,
      previous: prevAtt || kpi.avgAttendance,
      change: roundPct((curAtt || kpi.avgAttendance) - (prevAtt || kpi.avgAttendance)),
      unit: '%',
    },
    {
      metric: 'Assignment Completion',
      current: curAsnPct || kpi.avgAssignment,
      previous: prevAsnPct || kpi.avgAssignment,
      change: roundPct((curAsnPct || kpi.avgAssignment) - (prevAsnPct || kpi.avgAssignment)),
      unit: '%',
    },
    {
      metric: 'Quiz Participation',
      current: partPct,
      previous: Math.max(0, partPct - 3),
      change: Math.min(3, partPct),
      unit: '%',
    },
  ];
}

export function studentEngagementForWeek(
  student: Student,
  studentId: string,
  cohortId: string | undefined,
  sessions: SessionRow[],
  attendance: AttendanceRow[],
  weekStart: Date,
  weekEnd: Date,
): number {
  if (!cohortId) return student.engagementScore;
  let totalHours = 0;
  let attendedHours = 0;
  for (const sess of sessions) {
    const d = parseISODate(sess.session_date);
    if (!d || !isDateInRange(d, weekStart, weekEnd) || sess.cohort_id !== cohortId) continue;
    totalHours += sess.duration_hours ?? 0;
  }
  for (const ar of attendance) {
    if (ar.student_id !== studentId) continue;
    const sess = sessions.find(x => x.id === ar.session_id);
    if (!sess) continue;
    const d = parseISODate(sess.session_date);
    if (d && isDateInRange(d, weekStart, weekEnd)) attendedHours += ar.hours_attended ?? 0;
  }
  const att = computeAttendancePct(attendedHours, totalHours);
  return computeEngagementScore(att, student.assignmentCompletion, student.quizAverage);
}

export function buildWeeklyMovements(students: Student[], studentCohortUuid: Map<string, string>, sessions: SessionRow[], attendance: AttendanceRow[]): {
  newlyAtRisk: WeeklyMovement[];
  improved: WeeklyMovement[];
  followUp: WeeklyMovement[];
} {
  const currentWeek = computeWeekBounds(0);
  const prevWeek = computeWeekBounds(1);
  const movements = students.map(s => {
    const cohortId = studentCohortUuid.get(s.id);
    const currentScore = studentEngagementForWeek(
      s,
      s.id,
      cohortId,
      sessions,
      attendance,
      currentWeek.start,
      currentWeek.end,
    );
    const previousScore = studentEngagementForWeek(
      s,
      s.id,
      cohortId,
      sessions,
      attendance,
      prevWeek.start,
      prevWeek.end,
    );
    return {
      studentId: s.id,
      name: s.name,
      cohort: s.cohort,
      previousScore,
      currentScore,
      delta: currentScore - previousScore,
    };
  });

  const newlyAtRisk: WeeklyMovement[] = movements
    .filter(
      m =>
        m.currentScore < ENGAGEMENT_CATEGORY_THRESHOLDS.needsAttention &&
        m.previousScore >= ENGAGEMENT_CATEGORY_THRESHOLDS.needsAttention,
    )
    .slice(0, 20)
    .map(m => ({
      ...m,
      reason: 'Engagement dropped below the warning threshold this week.',
    }));

  const improved: WeeklyMovement[] = movements
    .filter(m => m.delta >= 5)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 20)
    .map(m => ({
      ...m,
      reason: 'Engagement improved compared to the previous week.',
    }));

  const riskStudents = buildRiskStudents(students);
  const followUp: WeeklyMovement[] = riskStudents.slice(0, 20).map(r => {
    const m = movements.find(x => x.studentId === r.studentId);
    return {
      studentId: r.studentId,
      name: r.name,
      cohort: r.cohort,
      previousScore: m?.previousScore ?? r.riskScore,
      currentScore: m?.currentScore ?? 100 - r.riskScore,
      delta: m?.delta ?? -5,
      reason: r.suggestedAction,
    };
  });

  return { newlyAtRisk, improved, followUp };
}

export interface AnalyticsBundle {
  attendanceDistribution: ChartDataPoint[];
  weeklyTrend: ChartDataPoint[];
  monthlyTrend: ChartDataPoint[];
  attendanceByCollege: ChartDataPoint[];
  attendanceByCohort: ChartDataPoint[];
  assignmentStatusDistribution: ChartDataPoint[];
  assignmentByCollege: ChartDataPoint[];
  assignmentByCohort: ChartDataPoint[];
  quizScoreDistribution: ChartDataPoint[];
  quizParticipation: ChartDataPoint[];
  quizByCohort: ChartDataPoint[];
  weeklyChanges: WeeklyChange[];
  newlyAtRisk: WeeklyMovement[];
  improvedStudents: WeeklyMovement[];
  followUpStudents: WeeklyMovement[];
  riskStudents: RiskStudent[];
  cohortMetricsTable: CohortMetric[];
  cohortQuizTrend: ChartDataPoint[];
}

export function buildAnalyticsBundle(
  students: Student[],
  ctx: {
    sessions: SessionRow[];
    attendance: AttendanceRow[];
    submissions: SubmissionRow[];
    quizResults: QuizResultRow[];
    studentCohortUuid: Map<string, string>;
    quizCountByCohort: Map<string, number>;
  },
): AnalyticsBundle {
  const prevAttByCohort = previousWeekMetricsByCohort(
    students,
    ctx.studentCohortUuid,
    ctx.sessions,
    ctx.attendance,
  );
  const weeklyTrend = buildWeeklyTrend(
    students,
    ctx.studentCohortUuid,
    ctx.sessions,
    ctx.attendance,
    ctx.submissions,
    ctx.quizResults,
  );
  const cohortNames = [...new Set(students.map(s => s.cohort).filter(Boolean))];
  const cohortQuizTrend = weeklyTrend.map(row => {
    const out: ChartDataPoint = { name: row.name as string, value: Number(row.quiz ?? 0) };
    for (const cohort of cohortNames) {
      const cohortStudents = students.filter(s => s.cohort === cohort);
      out[cohort] = average(cohortStudents.map(s => s.quizAverage));
    }
    return out;
  });

  const movements = buildWeeklyMovements(
    students,
    ctx.studentCohortUuid,
    ctx.sessions,
    ctx.attendance,
  );

  return {
    attendanceDistribution: attendanceDistribution(students),
    weeklyTrend,
    monthlyTrend: buildMonthlyTrend(
      students,
      ctx.studentCohortUuid,
      ctx.sessions,
      ctx.attendance,
    ),
    attendanceByCollege: averageByGroup(students, 'college', 'attendance'),
    attendanceByCohort: cohortComparisonBars(students, 'attendance', prevAttByCohort),
    assignmentStatusDistribution: assignmentStatusDistribution(ctx.submissions),
    assignmentByCollege: averageByGroup(students, 'college', 'assignmentCompletion'),
    assignmentByCohort: cohortComparisonBars(
      students,
      'assignmentCompletion',
      previousWeekMetricsByCohort(students, ctx.studentCohortUuid, ctx.sessions, ctx.attendance),
    ),
    quizScoreDistribution: quizScoreDistribution(students),
    quizParticipation: quizParticipationDistribution(
      students,
      ctx.quizResults,
      ctx.quizCountByCohort,
      ctx.studentCohortUuid,
    ),
    quizByCohort: cohortComparisonBars(students, 'quizAverage', new Map()),
    weeklyChanges: buildWeeklyChanges(
      students,
      ctx.studentCohortUuid,
      ctx.sessions,
      ctx.attendance,
      ctx.submissions,
      ctx.quizResults,
      ctx.quizCountByCohort,
    ),
    newlyAtRisk: movements.newlyAtRisk,
    improvedStudents: movements.improved,
    followUpStudents: movements.followUp,
    riskStudents: buildRiskStudents(students),
    cohortMetricsTable: buildCohortMetricsTable(students),
    cohortQuizTrend,
  };
}
