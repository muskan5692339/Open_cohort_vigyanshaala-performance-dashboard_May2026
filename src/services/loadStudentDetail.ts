import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computeEngagementScore,
  computeRiskCategory,
  computeRiskScore,
  computeStudentMetrics,
  METRIC_WEIGHTS,
  type SessionRow,
} from './studentMetrics';

export interface StudentDetailSummary {
  student_pk: string;
  student_id: string;
  name: string;
  email: string;
  status: string;
  college_id: string;
  college_name: string;
  current_program_id: string;
  program_name: string;
  current_cohort_id: string;
  cohort_name: string;
  state: string;
  total_sessions: number;
  attended_sessions: number;
  total_session_hours: number;
  total_hours_attended: number;
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

export interface SessionTrendPoint {
  date: string;
  timestamp: number;
  hours: number;
}

export interface AssignmentRow {
  name: string;
  due: string;
  status: string;
}

export interface QuizChartPoint {
  name: string;
  score: number;
}

export interface StudentDetailPayload {
  summary: StudentDetailSummary;
  sessionTrend: SessionTrendPoint[];
  assignments: AssignmentRow[];
  quizChart: QuizChartPoint[];
}

export async function loadStudentDetail(
  supabase: SupabaseClient,
  email: string,
): Promise<StudentDetailPayload | null> {
  const { data: rawStu } = await supabase
    .from('students')
    .select(
      'id, student_id, name, email, status, college_id, current_program_id, current_cohort_id, state, enrollment_date, last_synced_at',
    )
    .eq('email', email)
    .maybeSingle();

  if (!rawStu) return null;

  const cohortId = rawStu.current_cohort_id ?? null;

  const [collegeRes, cohortRes, programRes, sessionsRes, asnDefsRes, quizRes] = await Promise.all([
    rawStu.college_id
      ? supabase.from('colleges').select('name').eq('id', rawStu.college_id).maybeSingle()
      : Promise.resolve({ data: null }),
    cohortId
      ? supabase.from('cohorts').select('id, name').eq('id', cohortId).maybeSingle()
      : Promise.resolve({ data: null }),
    rawStu.current_program_id
      ? supabase.from('programs').select('name').eq('id', rawStu.current_program_id).maybeSingle()
      : Promise.resolve({ data: null }),
    cohortId
      ? supabase
          .from('sessions')
          .select('id, session_date, duration_hours')
          .eq('cohort_id', cohortId)
          .order('session_date', { ascending: true })
      : Promise.resolve({ data: [] as { id: string; session_date: string; duration_hours: number }[] }),
    cohortId
      ? supabase.from('assignments').select('id, name, due_date').eq('cohort_id', cohortId).order('due_date')
      : Promise.resolve({ data: [] as { id: string; name: string; due_date: string | null }[] }),
    supabase
      .from('quiz_results')
      .select('score, percentage, taken_at, quiz_id')
      .eq('student_id', rawStu.id)
      .order('taken_at', { ascending: true }),
  ]);

  const sessions: SessionRow[] = (sessionsRes.data ?? []).map(s => ({
    id: s.id,
    cohort_id: cohortId!,
    session_date: s.session_date,
    duration_hours: Number(s.duration_hours ?? 0),
  }));

  const { data: attRecs } = await supabase
    .from('attendance_records')
    .select('session_id, hours_attended, attended')
    .eq('student_id', rawStu.id);

  const attBySession = new Map(
    (attRecs ?? []).map(r => [r.session_id, { hours: Number(r.hours_attended ?? 0), attended: r.attended }]),
  );

  const sessionById = new Map(sessions.map(s => [s.id, s]));
  let totalSessionHours = sessions.reduce((sum, s) => sum + (s.duration_hours ?? 0), 0);
  if (totalSessionHours <= 0 && attRecs?.length) {
    for (const ar of attRecs) {
      const sess = sessionById.get(ar.session_id);
      if (sess) totalSessionHours += sess.duration_hours ?? 0;
    }
  }
  const totalHoursAttended = (attRecs ?? []).reduce((sum, r) => sum + Number(r.hours_attended ?? 0), 0);
  const attendanceRecordCount = attRecs?.length ?? 0;
  const attendedSessions = (attRecs ?? []).filter(r => (r.hours_attended ?? 0) > 0 || r.attended).length;

  const assignmentDefs = asnDefsRes.data ?? [];
  const totalAssignments = assignmentDefs.length;

  const { data: asnSubs } = await supabase
    .from('assignment_submissions')
    .select('assignment_id, status, submitted_at')
    .eq('student_id', rawStu.id);

  const subByAssignment = new Map((asnSubs ?? []).map(s => [s.assignment_id, s]));
  const submittedAsn = (asnSubs ?? []).filter(r => r.status && r.status !== 'Pending').length;

  const quizRows = quizRes.data ?? [];
  const quizIds = [...new Set(quizRows.map(r => r.quiz_id).filter(Boolean))] as string[];
  const quizNameMap = new Map<string, string>();
  if (quizIds.length) {
    const { data: quizDefs } = await supabase.from('quizzes').select('id, name').in('id', quizIds);
    for (const q of quizDefs ?? []) quizNameMap.set(q.id, q.name);
  }
  const percentages = quizRows.map(r => Number(r.percentage ?? r.score ?? 0));
  const scores = quizRows.map(r => Number(r.score ?? 0));

  const metrics = computeStudentMetrics({
    studentHours: totalHoursAttended,
    cohortTotalHours: totalSessionHours,
    submittedAssignments: submittedAsn,
    totalAssignments: totalAssignments || (asnSubs?.length ?? 0),
    quizScores: scores,
    quizPercentages: percentages,
    attendanceRecordCount,
    attendedRecordCount: attendedSessions,
    studentSubmissionTotal: asnSubs?.length ?? 0,
  });

  const summary: StudentDetailSummary = {
    student_pk: rawStu.id,
    student_id: rawStu.student_id ?? '',
    name: rawStu.name ?? '',
    email: rawStu.email ?? '',
    status: rawStu.status ?? 'Active',
    college_id: rawStu.college_id ?? '',
    college_name: (collegeRes.data as { name?: string } | null)?.name ?? '',
    current_program_id: rawStu.current_program_id ?? '',
    program_name: (programRes.data as { name?: string } | null)?.name ?? '',
    current_cohort_id: cohortId ?? '',
    cohort_name: (cohortRes.data as { name?: string } | null)?.name ?? '',
    state: rawStu.state ?? '',
    total_sessions: sessions.length,
    attended_sessions: attendedSessions,
    total_session_hours: totalSessionHours,
    total_hours_attended: totalHoursAttended,
    attendance_percentage: metrics.attendance,
    total_assignments: totalAssignments,
    submitted_assignments: submittedAsn,
    assignment_completion_pct: metrics.assignmentCompletion,
    total_quizzes: quizRows.length,
    attempted_quizzes: quizRows.length,
    average_quiz_score: metrics.quizAverage,
    engagement_score: metrics.engagementScore,
    category: metrics.riskCategory,
    last_calculated_at: rawStu.last_synced_at ?? new Date().toISOString(),
  };

  const sessionTrend: SessionTrendPoint[] = sessions.map(sess => {
    const att = attBySession.get(sess.id);
    const hours = att?.hours ?? 0;
    const d = new Date(sess.session_date.includes('T') ? sess.session_date : `${sess.session_date}T00:00:00`);
    return {
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      timestamp: d.getTime(),
      hours: hours > 0 ? hours : att?.attended ? sess.duration_hours : 0,
    };
  });

  const assignments: AssignmentRow[] = assignmentDefs.map(a => {
    const sub = subByAssignment.get(a.id);
    const status = sub?.status ?? 'Pending';
    const due = a.due_date
      ? new Date(a.due_date.includes('T') ? a.due_date : `${a.due_date}T00:00:00`).toLocaleDateString('en-US', {
          month: 'numeric',
          day: 'numeric',
          year: 'numeric',
        })
      : '—';
    return { name: a.name, due, status };
  });

  const quizChart: QuizChartPoint[] = quizRows.map((r, i) => ({
    name: quizNameMap.get(r.quiz_id) ?? `Quiz ${i + 1}`,
    score: Math.round(Number(r.percentage ?? r.score ?? 0)),
  }));

  return { summary, sessionTrend, assignments, quizChart };
}

/** Map materialized-view row to summary using shared category thresholds when view exists. */
export function summaryFromMaterializedView(
  viewData: Record<string, unknown>,
  names: { cohort?: string; program?: string; college?: string },
): StudentDetailSummary {
  const att = Number(viewData.attendance_percentage ?? 0);
  const asn = Number(viewData.assignment_completion_pct ?? 0);
  const qz = Number(viewData.average_quiz_score ?? 0);
  const engagement = computeEngagementScore(att, asn, qz);
  return {
    student_pk: String(viewData.student_pk ?? ''),
    student_id: String(viewData.student_id ?? ''),
    name: String(viewData.name ?? ''),
    email: String(viewData.email ?? ''),
    status: String(viewData.status ?? 'Active'),
    college_id: String(viewData.college_id ?? ''),
    college_name: names.college ?? '',
    current_program_id: String(viewData.current_program_id ?? ''),
    program_name: names.program ?? '',
    current_cohort_id: String(viewData.current_cohort_id ?? ''),
    cohort_name: names.cohort ?? '',
    state: String(viewData.state ?? ''),
    total_sessions: Number(viewData.total_sessions ?? 0),
    attended_sessions: Number(viewData.attended_sessions ?? 0),
    total_session_hours: 0,
    total_hours_attended: 0,
    attendance_percentage: att,
    total_assignments: Number(viewData.total_assignments ?? 0),
    submitted_assignments: Number(viewData.submitted_assignments ?? 0),
    assignment_completion_pct: asn,
    total_quizzes: Number(viewData.total_quizzes ?? 0),
    attempted_quizzes: Number(viewData.attempted_quizzes ?? 0),
    average_quiz_score: qz,
    engagement_score: engagement,
    category: computeRiskCategory(engagement),
    last_calculated_at: String(viewData.last_calculated_at ?? new Date().toISOString()),
  };
}

export { METRIC_WEIGHTS, computeRiskScore };
