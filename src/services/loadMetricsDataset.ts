import type { SupabaseClient } from '@supabase/supabase-js';
import type { Student } from '../types/adminTypes';
import {
  buildAnalyticsBundle,
  buildKPISummary,
  buildStudentRecord,
  computeEngagementScore,
  computeRiskCategory,
  computeRiskScore,
  computeStudentMetrics,
  roundPct,
  type AnalyticsBundle,
  type AttendanceRow,
  type KPISummary,
  type QuizResultRow,
  type RawStudentRow,
  type SessionRow,
  type SubmissionRow,
} from './studentMetrics';

export type { AnalyticsBundle, KPISummary };

export interface CohortSummary {
  cohort: string;
  totalStudents: number;
  attendance: number;
  assignmentCompletion: number;
  quizAverage: number;
  atRisk: number;
}

export interface MetricsDataset {
  students: Student[];
  kpi: KPISummary;
  cohortMetrics: CohortSummary[];
  filterOptions: { cohorts: string[]; colleges: string[]; states: string[]; programs: string[] };
  analytics: AnalyticsBundle;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Use matview row when raw aggregation returned 0 but DB summary has real values. */
async function enrichFromPerformanceSummary(
  supabase: SupabaseClient,
  students: Student[],
): Promise<Student[]> {
  const { data: rows, error } = await supabase
    .from('student_performance_summary')
    .select('student_pk, attendance_percentage, assignment_completion_pct, average_quiz_score')
    .limit(5000);
  if (error || !rows?.length) return students;

  const byPk = new Map(rows.map(r => [r.student_pk as string, r]));
  return students.map(s => {
    const v = byPk.get(s.id);
    if (!v) return s;
    const att = Number(v.attendance_percentage ?? 0);
    const asn = Number(v.assignment_completion_pct ?? 0);
    const qz = Number(v.average_quiz_score ?? 0);
    const needsAtt = s.attendance === 0 && att > 0;
    const needsAsn = s.assignmentCompletion === 0 && asn > 0;
    const needsQz = s.quizAverage === 0 && qz > 0;
    if (!needsAtt && !needsAsn && !needsQz) return s;

    const attendance = needsAtt ? roundPct(att) : s.attendance;
    const assignmentCompletion = needsAsn ? roundPct(asn) : s.assignmentCompletion;
    const quizAverage = needsQz ? roundPct(qz) : s.quizAverage;
    const engagementScore = computeEngagementScore(attendance, assignmentCompletion, quizAverage);
    return {
      ...s,
      attendance,
      assignmentCompletion,
      quizAverage,
      engagementScore,
      riskCategory: computeRiskCategory(engagementScore),
      riskScore: computeRiskScore(engagementScore),
    };
  });
}

const EMPTY: MetricsDataset = {
  students: [],
  kpi: {
    totalStudents: 0,
    activeStudents: 0,
    atRiskStudents: 0,
    avgAttendance: 0,
    avgAssignment: 0,
    avgQuiz: 0,
    avgEngagement: 0,
    topPerformers: 0,
  },
  cohortMetrics: [],
  filterOptions: { cohorts: [], colleges: [], states: [], programs: [] },
  analytics: buildAnalyticsBundle([], {
    sessions: [],
    attendance: [],
    submissions: [],
    quizResults: [],
    studentCohortUuid: new Map(),
    quizCountByCohort: new Map(),
  }),
};

export async function loadMetricsDataset(supabase: SupabaseClient): Promise<MetricsDataset> {
  const { data: rawStudents, error: sErr } = await supabase
    .from('students')
    .select(
      'id, student_id, name, email, status, state, college_id, current_cohort_id, current_program_id, certificate_status',
    )
    .limit(5000);

  let studentsRows: RawStudentRow[] | null = rawStudents as RawStudentRow[] | null;

  if (sErr) {
    const { data: fallback, error: sErr2 } = await supabase
      .from('students')
      .select('id, student_id, name, email, status, state, college_id, current_cohort_id, current_program_id')
      .limit(5000);
    if (sErr2) throw sErr2;
    studentsRows = (fallback ?? []).map(s => ({ ...s, certificate_status: null }));
  }

  if (!studentsRows?.length) return EMPTY;

  const studentPks = studentsRows.map(s => s.id);
  const importedMetricsByStudent = new Map<
    string,
    { attendance?: number; assignment?: number; quiz?: number }
  >();
  for (const pkChunk of chunkArray(studentPks, 500)) {
    const { data: engRows } = await supabase
      .from('engagement_metrics')
      .select('student_id, attendance_percentage, assignment_completion, quiz_performance, calculated_at')
      .in('student_id', pkChunk)
      .order('calculated_at', { ascending: false });
    for (const row of engRows ?? []) {
      const sid = row.student_id as string;
      if (importedMetricsByStudent.has(sid)) continue;
      importedMetricsByStudent.set(sid, {
        attendance: Number(row.attendance_percentage ?? 0),
        assignment: Number(row.assignment_completion ?? 0),
        quiz: Number(row.quiz_performance ?? 0),
      });
    }
  }

  const { data: allCohorts } = await supabase.from('cohorts').select('id, name');
  const cohortIdToName = new Map<string, string>((allCohorts ?? []).map(c => [c.id as string, c.name as string]));
  const cohortNameToId = new Map<string, string>((allCohorts ?? []).map(c => [c.name as string, c.id as string]));

  const resolveCohortUuid = (raw: string | null): string | null => {
    if (!raw) return null;
    if (cohortIdToName.has(raw)) return raw;
    return cohortNameToId.get(raw) ?? null;
  };

  const getCohortName = (raw: string | null): string => {
    if (!raw) return '';
    return cohortIdToName.get(raw) ?? raw;
  };

  const collegeIds = [...new Set(studentsRows.map(s => s.college_id).filter(Boolean))] as string[];
  const programIds = [...new Set(studentsRows.map(s => s.current_program_id).filter(Boolean))] as string[];

  const [collegesRes, programsRes] = await Promise.all([
    collegeIds.length
      ? supabase.from('colleges').select('id, name').in('id', collegeIds)
      : { data: [] as { id: string; name: string }[] },
    programIds.length
      ? supabase.from('programs').select('id, name').in('id', programIds)
      : { data: [] as { id: string; name: string }[] },
  ]);

  const collegeMap = new Map<string, string>((collegesRes.data ?? []).map(c => [c.id, c.name]));
  const programMap = new Map<string, string>((programsRes.data ?? []).map(p => [p.id, p.name]));

  const resolvedCohortIds = [
    ...new Set(studentsRows.map(s => resolveCohortUuid(s.current_cohort_id ?? null)).filter(Boolean)),
  ] as string[];

  const studentCohortUuid = new Map<string, string>();
  for (const s of studentsRows) {
    const uuid = resolveCohortUuid(s.current_cohort_id ?? null);
    if (uuid) studentCohortUuid.set(s.id, uuid);
  }

  let { data: sessionsData } = resolvedCohortIds.length
    ? await supabase
        .from('sessions')
        .select('id, cohort_id, session_date, duration_hours')
        .in('cohort_id', resolvedCohortIds)
        .limit(10000)
    : { data: [] as SessionRow[] };

  const studentIds = studentsRows.map(s => s.id);
  const attendance: AttendanceRow[] = [];
  for (const chunk of chunkArray(studentIds, 100)) {
    const { data } = await supabase
      .from('attendance_records')
      .select('student_id, session_id, hours_attended, attended')
      .in('student_id', chunk);
    if (data) {
      attendance.push(
        ...data.map(r => ({
          student_id: r.student_id,
          session_id: r.session_id,
          hours_attended: Number(r.hours_attended ?? 0),
          attended: Boolean(r.attended),
        })),
      );
    }
  }

  // If cohort filter returned no sessions but attendance exists, load all sessions
  if (!(sessionsData ?? []).length && attendance.length > 0) {
    const { data: allSessions } = await supabase
      .from('sessions')
      .select('id, cohort_id, session_date, duration_hours')
      .limit(10000);
    sessionsData = allSessions ?? [];
  }

  const sessions: SessionRow[] = (sessionsData ?? []).map(s => ({
    id: s.id,
    cohort_id: s.cohort_id,
    session_date: s.session_date,
    duration_hours: Number(s.duration_hours ?? 0),
  }));

  const sessionDurationByCohort = new Map<string, number>();
  for (const s of sessions) {
    sessionDurationByCohort.set(
      s.cohort_id,
      (sessionDurationByCohort.get(s.cohort_id) ?? 0) + (s.duration_hours ?? 0),
    );
  }

  const attHoursByStudent = new Map<string, number>();
  const attStatsByStudent = new Map<string, { recordCount: number; attendedCount: number }>();
  for (const r of attendance) {
    attHoursByStudent.set(r.student_id, (attHoursByStudent.get(r.student_id) ?? 0) + r.hours_attended);
    const stats = attStatsByStudent.get(r.student_id) ?? { recordCount: 0, attendedCount: 0 };
    stats.recordCount += 1;
    if (r.attended || r.hours_attended > 0) stats.attendedCount += 1;
    attStatsByStudent.set(r.student_id, stats);
  }

  let { data: assignments } = resolvedCohortIds.length
    ? await supabase.from('assignments').select('id, cohort_id').in('cohort_id', resolvedCohortIds).limit(10000)
    : { data: [] as { id: string; cohort_id: string }[] };

  const asnCountByCohort = new Map<string, number>();
  for (const a of assignments ?? []) {
    asnCountByCohort.set(a.cohort_id, (asnCountByCohort.get(a.cohort_id) ?? 0) + 1);
  }

  const submissions: SubmissionRow[] = [];
  for (const chunk of chunkArray(studentIds, 100)) {
    const { data } = await supabase
      .from('assignment_submissions')
      .select('student_id, status, submitted_at')
      .in('student_id', chunk);
    if (data) submissions.push(...data);
  }

  if (!(assignments ?? []).length && submissions.length > 0) {
    const { data: allAsn } = await supabase.from('assignments').select('id, cohort_id').limit(10000);
    assignments = allAsn ?? [];
    for (const a of assignments ?? []) {
      asnCountByCohort.set(a.cohort_id, (asnCountByCohort.get(a.cohort_id) ?? 0) + 1);
    }
  }

  const asnSubByStudent = new Map<string, number>();
  const submissionTotalByStudent = new Map<string, number>();
  for (const r of submissions) {
    submissionTotalByStudent.set(
      r.student_id,
      (submissionTotalByStudent.get(r.student_id) ?? 0) + 1,
    );
    if (r.status && r.status !== 'Pending') {
      asnSubByStudent.set(r.student_id, (asnSubByStudent.get(r.student_id) ?? 0) + 1);
    }
  }

  const quizResults: QuizResultRow[] = [];
  for (const chunk of chunkArray(studentIds, 100)) {
    const { data } = await supabase
      .from('quiz_results')
      .select('student_id, score, percentage, taken_at')
      .in('student_id', chunk);
    if (data) {
      quizResults.push(
        ...data.map(r => ({
          student_id: r.student_id,
          score: Number(r.score ?? 0),
          percentage: Number(r.percentage ?? r.score ?? 0),
          taken_at: r.taken_at,
        })),
      );
    }
  }

  const quizByStudent = new Map<string, { scores: number[]; percentages: number[] }>();
  for (const r of quizResults) {
    if (!quizByStudent.has(r.student_id)) {
      quizByStudent.set(r.student_id, { scores: [], percentages: [] });
    }
    const bucket = quizByStudent.get(r.student_id)!;
    bucket.scores.push(r.score);
    bucket.percentages.push(r.percentage);
  }

  const { data: quizzes } = resolvedCohortIds.length
    ? await supabase.from('quizzes').select('id, cohort_id').in('cohort_id', resolvedCohortIds).limit(10000)
    : { data: [] as { id: string; cohort_id: string }[] };

  const quizCountByCohort = new Map<string, number>();
  for (const q of quizzes ?? []) {
    quizCountByCohort.set(q.cohort_id, (quizCountByCohort.get(q.cohort_id) ?? 0) + 1);
  }

  const sessionById = new Map(sessions.map(s => [s.id, s]));

  function cohortHoursForStudent(studentId: string, cohortUuid: string): number {
    const fromCohort = cohortUuid ? sessionDurationByCohort.get(cohortUuid) ?? 0 : 0;
    if (fromCohort > 0) return fromCohort;
    let sum = 0;
    for (const ar of attendance) {
      if (ar.student_id !== studentId) continue;
      const sess = sessionById.get(ar.session_id);
      if (sess) sum += sess.duration_hours ?? 0;
    }
    return sum;
  }

  const students: Student[] = studentsRows.map(raw => {
    const resolvedCohortUuid = resolveCohortUuid(raw.current_cohort_id ?? null) ?? '';
    const totalCohortHours = cohortHoursForStudent(raw.id, resolvedCohortUuid);
    const studentHours = attHoursByStudent.get(raw.id) ?? 0;
    const totalAsn = asnCountByCohort.get(resolvedCohortUuid) ?? 0;
    const submittedAsn = asnSubByStudent.get(raw.id) ?? 0;
    const quiz = quizByStudent.get(raw.id) ?? { scores: [], percentages: [] };

    const attStats = attStatsByStudent.get(raw.id) ?? { recordCount: 0, attendedCount: 0 };

    const imported = importedMetricsByStudent.get(raw.id);

    const metrics = computeStudentMetrics({
      studentHours,
      cohortTotalHours: totalCohortHours,
      submittedAssignments: submittedAsn,
      totalAssignments: totalAsn,
      quizScores: quiz.scores,
      quizPercentages: quiz.percentages,
      attendanceRecordCount: attStats.recordCount,
      attendedRecordCount: attStats.attendedCount,
      studentSubmissionTotal: submissionTotalByStudent.get(raw.id) ?? 0,
      importedAttendancePct: imported?.attendance,
      importedAssignmentPct: imported?.assignment,
      importedQuizPct: imported?.quiz,
    });

    return buildStudentRecord(
      raw,
      {
        college: collegeMap.get(raw.college_id ?? '') ?? raw.college_id ?? '',
        cohort: getCohortName(raw.current_cohort_id ?? null),
        program: programMap.get(raw.current_program_id ?? '') ?? raw.current_program_id ?? '',
      },
      metrics,
    );
  });

  let enrichedStudents = await enrichFromPerformanceSummary(supabase, students);

  const kpi = buildKPISummary(enrichedStudents);

  const cohortGroups = new Map<string, Student[]>();
  for (const s of enrichedStudents) {
    if (!s.cohort) continue;
    if (!cohortGroups.has(s.cohort)) cohortGroups.set(s.cohort, []);
    cohortGroups.get(s.cohort)!.push(s);
  }

  const cohortMetrics: CohortSummary[] = [...cohortGroups.entries()].map(([cohort, cohortStudents]) => ({
    cohort,
    totalStudents: cohortStudents.length,
    attendance: buildKPISummary(cohortStudents).avgAttendance,
    assignmentCompletion: buildKPISummary(cohortStudents).avgAssignment,
    quizAverage: buildKPISummary(cohortStudents).avgQuiz,
    atRisk: cohortStudents.filter(s => s.riskCategory === 'At Risk').length,
  }));

  const uniqueSorted = (arr: string[]) => [...new Set(arr)].filter(Boolean).sort();
  const filterOptions = {
    cohorts: uniqueSorted(enrichedStudents.map(s => s.cohort)),
    colleges: uniqueSorted(enrichedStudents.map(s => s.college)),
    states: uniqueSorted(enrichedStudents.map(s => s.state)),
    programs: uniqueSorted(enrichedStudents.map(s => s.program)),
  };

  const analytics = buildAnalyticsBundle(enrichedStudents, {
    sessions,
    attendance,
    submissions,
    quizResults,
    studentCohortUuid,
    quizCountByCohort,
  });

  return { students: enrichedStudents, kpi, cohortMetrics, filterOptions, analytics };
}
