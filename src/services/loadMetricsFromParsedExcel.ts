import type {
  ParsedAssignment,
  ParsedAttendance,
  ParsedQuiz,
  ParsedStudent,
} from '../types/syncTypes';
import type { ColumnMapping, DiscoveredColumn } from '../types/dynamicSchema';
import type { MetricsDataset } from './loadMetricsDataset';
import {
  buildAnalyticsBundle,
  buildKPISummary,
  buildStudentRecord,
  computeStudentMetrics,
  type AttendanceRow,
  type QuizResultRow,
  type SessionRow,
  type SubmissionRow,
} from './studentMetrics';

import type { ClassWiseAttendanceEntry } from './classWiseAttendance';

export interface ParsedExcelPayload {
  cohortName: string;
  fileName: string;
  students: ParsedStudent[];
  attendance: ParsedAttendance[];
  assignments: ParsedAssignment[];
  quiz: ParsedQuiz[];
  rawRows?: Record<string, string>[];
  headers?: string[];
  discoveredColumns?: DiscoveredColumn[];
  mapping?: ColumnMapping;
  /** Per-session hours from "Class-wise Attendance" worksheet, keyed by student email */
  classWiseAttendance?: ClassWiseAttendanceEntry[];
  classWiseAttendanceColumns?: string[];
}

const LOCAL_COHORT_ID = 'local-cohort';

/** Attendance % from student row or wide-format attendance record (hours_attended 0–100, duration 100). */
function resolveImportedAttendancePct(
  ps: ParsedStudent,
  attRecords: ParsedAttendance[],
): number | undefined {
  if (ps.imported_attendance_pct != null && ps.imported_attendance_pct >= 0) {
    return ps.imported_attendance_pct;
  }
  for (const ar of attRecords) {
    const hrs = ar.hours_attended;
    const dur = ar.duration_hours ?? 0;
    if (hrs != null && hrs >= 0 && hrs <= 100 && (dur === 100 || dur === 0 || dur === hrs)) {
      return Math.round(hrs);
    }
  }
  return undefined;
}

export function loadMetricsFromParsedExcel(payload: ParsedExcelPayload): MetricsDataset {
  const emailToId = new Map<string, string>();
  for (let i = 0; i < payload.students.length; i++) {
    const email = payload.students[i].email.toLowerCase();
    emailToId.set(email, `local-${i}-${email.replace(/[^a-z0-9]/g, '')}`);
  }

  const assignmentNames = [...new Set(payload.assignments.map(a => a.assignment_name))];
  const totalAssignments = assignmentNames.length;

  const submittedByEmail = new Map<string, number>();
  for (const a of payload.assignments) {
    const email = a.student_email.toLowerCase();
    if (a.status === 'Submitted' || a.status === 'Late Submission') {
      submittedByEmail.set(email, (submittedByEmail.get(email) ?? 0) + 1);
    }
  }

  const quizByEmail = new Map<string, { scores: number[]; percentages: number[] }>();
  for (const q of payload.quiz) {
    const email = q.student_email.toLowerCase();
    if (!quizByEmail.has(email)) quizByEmail.set(email, { scores: [], percentages: [] });
    const bucket = quizByEmail.get(email)!;
    bucket.scores.push(q.score);
    bucket.percentages.push(q.percentage);
  }

  const attByEmail = new Map<string, ParsedAttendance[]>();
  for (const a of payload.attendance) {
    const email = a.student_email.toLowerCase();
    if (!attByEmail.has(email)) attByEmail.set(email, []);
    attByEmail.get(email)!.push(a);
  }

  const sessions: SessionRow[] = [];
  const sessionIdByDate = new Map<string, string>();
  for (const a of payload.attendance) {
    if (sessionIdByDate.has(a.session_date)) continue;
    const sid = `session-${a.session_date}`;
    sessionIdByDate.set(a.session_date, sid);
    sessions.push({
      id: sid,
      cohort_id: LOCAL_COHORT_ID,
      session_date: a.session_date,
      duration_hours: a.duration_hours ?? 100,
    });
  }

  const attendanceRows: AttendanceRow[] = [];
  const submissions: SubmissionRow[] = [];
  const quizResults: QuizResultRow[] = [];

  const students = payload.students.map((ps, idx) => {
    const email = ps.email.toLowerCase();
    const id = emailToId.get(email) ?? `local-${idx}`;
    const attRecords = attByEmail.get(email) ?? [];

    let studentHours = 0;
    let recordCount = 0;
    let attendedCount = 0;
    for (const ar of attRecords) {
      const sessionId = sessionIdByDate.get(ar.session_date);
      if (!sessionId) continue;
      const hours = ar.hours_attended ?? (ar.attended ? ar.duration_hours : 0);
      studentHours += hours;
      recordCount++;
      if (ar.attended || hours > 0) attendedCount++;
      attendanceRows.push({
        student_id: id,
        session_id: sessionId,
        hours_attended: hours,
        attended: ar.attended,
      });
    }

    const cohortTotalHours = attRecords.reduce((sum, r) => sum + (r.duration_hours ?? 100), 0);
    const submitted = submittedByEmail.get(email) ?? 0;
    const quiz = quizByEmail.get(email) ?? { scores: [], percentages: [] };

    for (const a of payload.assignments) {
      if (a.student_email.toLowerCase() !== email) continue;
      submissions.push({
        student_id: id,
        status: a.status,
        submitted_at: a.submitted_at ?? null,
      });
    }

    for (const q of payload.quiz) {
      if (q.student_email.toLowerCase() !== email) continue;
      quizResults.push({
        student_id: id,
        score: q.score,
        percentage: q.percentage,
        taken_at: q.quiz_date,
      });
    }

    const importedAttendance = resolveImportedAttendancePct(ps, attRecords);

    const metrics = computeStudentMetrics({
      studentHours: importedAttendance ?? studentHours,
      cohortTotalHours: importedAttendance != null ? 100 : cohortTotalHours,
      submittedAssignments: submitted,
      totalAssignments,
      quizScores: quiz.scores,
      quizPercentages: quiz.percentages,
      attendanceRecordCount: recordCount || (importedAttendance != null ? 1 : 0),
      attendedRecordCount: attendedCount || (importedAttendance != null && importedAttendance > 0 ? 1 : 0),
      studentSubmissionTotal: submissions.filter(s => s.student_id === id).length,
      importedAttendancePct: importedAttendance,
      importedAssignmentPct: ps.imported_assignment_pct,
      importedQuizPct: ps.imported_quiz_pct,
    });

    return buildStudentRecord(
      {
        id,
        student_id: ps.student_id,
        name: ps.name,
        email: ps.email,
        status: ps.status,
        state: ps.state,
        certificate_status: ps.certificate_status,
      },
      {
        college: ps.college,
        cohort: ps.cohort || payload.cohortName,
        program: ps.program,
      },
      metrics,
    );
  });

  const kpi = buildKPISummary(students);

  const cohortGroups = new Map<string, typeof students>();
  for (const s of students) {
    if (!s.cohort) continue;
    if (!cohortGroups.has(s.cohort)) cohortGroups.set(s.cohort, []);
    cohortGroups.get(s.cohort)!.push(s);
  }

  const cohortMetrics = [...cohortGroups.entries()].map(([cohort, cohortStudents]) => ({
    cohort,
    totalStudents: cohortStudents.length,
    attendance: buildKPISummary(cohortStudents).avgAttendance,
    assignmentCompletion: buildKPISummary(cohortStudents).avgAssignment,
    quizAverage: buildKPISummary(cohortStudents).avgQuiz,
    atRisk: cohortStudents.filter(s => s.riskCategory === 'At Risk').length,
  }));

  const uniqueSorted = (arr: string[]) => [...new Set(arr)].filter(Boolean).sort();
  const filterOptions = {
    cohorts: uniqueSorted(students.map(s => s.cohort)),
    colleges: uniqueSorted(students.map(s => s.college)),
    states: uniqueSorted(students.map(s => s.state)),
    programs: uniqueSorted(students.map(s => s.program)),
  };

  const studentCohortUuid = new Map(students.map(s => [s.id, LOCAL_COHORT_ID]));
  const quizCountByCohort = new Map([[LOCAL_COHORT_ID, payload.quiz.length > 0 ? 1 : 0]]);

  const analytics = buildAnalyticsBundle(students, {
    sessions,
    attendance: attendanceRows,
    submissions,
    quizResults,
    studentCohortUuid,
    quizCountByCohort,
  });

  return { students, kpi, cohortMetrics, filterOptions, analytics };
}
