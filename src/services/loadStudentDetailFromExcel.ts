import type { ParsedExcelPayload } from './loadMetricsFromParsedExcel';
import type { StudentDetailPayload } from './loadStudentDetail';
import { computeStudentMetrics } from './studentMetrics';

function normEmail(e: string): string {
  return e.toLowerCase().trim();
}

export function loadStudentDetailFromExcel(
  email: string,
  payload: ParsedExcelPayload,
): StudentDetailPayload | null {
  const key = normEmail(email);
  const student = payload.students.find(s => normEmail(s.email) === key);
  if (!student) return null;

  const attRecords = payload.attendance.filter(a => normEmail(a.student_email) === key);
  const assignRows = payload.assignments.filter(a => normEmail(a.student_email) === key);
  const quizRows = payload.quiz.filter(q => normEmail(q.student_email) === key);

  const totalAssignments = [...new Set(payload.assignments.map(a => a.assignment_name))].length;
  const submittedAsn = assignRows.filter(
    a => a.status === 'Submitted' || a.status === 'Late Submission',
  ).length;

  const totalSessionHours = attRecords.reduce((sum, r) => sum + (r.duration_hours ?? 100), 0) || 100;
  const totalHoursAttended = attRecords.reduce(
    (sum, r) => sum + (r.hours_attended ?? (r.attended ? r.duration_hours : 0)),
    0,
  );
  const attendedSessions = attRecords.filter(
    r => r.attended || (r.hours_attended ?? 0) > 0,
  ).length;

  const importedAtt = student.imported_attendance_pct;
  const metrics = computeStudentMetrics({
    studentHours: importedAtt ?? totalHoursAttended,
    cohortTotalHours: importedAtt != null ? 100 : totalSessionHours,
    submittedAssignments: submittedAsn,
    totalAssignments: totalAssignments || assignRows.length,
    quizScores: quizRows.map(q => q.score),
    quizPercentages: quizRows.map(q => q.percentage),
    attendanceRecordCount: attRecords.length || (importedAtt != null ? 1 : 0),
    attendedRecordCount: attendedSessions || (importedAtt != null && importedAtt > 0 ? 1 : 0),
    studentSubmissionTotal: assignRows.length,
    importedAttendancePct: importedAtt,
    importedAssignmentPct: student.imported_assignment_pct,
    importedQuizPct: student.imported_quiz_pct,
  });

  const summary = {
    student_pk: `excel-${key}`,
    student_id: student.student_id,
    name: student.name,
    email: student.email,
    status: student.status,
    college_id: '',
    college_name: student.college,
    current_program_id: '',
    program_name: student.program,
    current_cohort_id: '',
    cohort_name: student.cohort || payload.cohortName,
    state: student.state,
    total_sessions: attRecords.length || 1,
    attended_sessions: attendedSessions || (metrics.attendance > 0 ? 1 : 0),
    total_session_hours: importedAtt != null ? 100 : totalSessionHours,
    total_hours_attended: importedAtt ?? totalHoursAttended,
    attendance_percentage: metrics.attendance,
    total_assignments: totalAssignments || assignRows.length,
    submitted_assignments: submittedAsn,
    assignment_completion_pct: metrics.assignmentCompletion,
    total_quizzes: quizRows.length,
    attempted_quizzes: quizRows.length,
    average_quiz_score: metrics.quizAverage,
    engagement_score: metrics.engagementScore,
    category: metrics.riskCategory,
    last_calculated_at: new Date().toISOString(),
  };

  const sessionTrend = attRecords.map(ar => {
    const d = new Date(
      ar.session_date.includes('T') ? ar.session_date : `${ar.session_date}T00:00:00`,
    );
    const hours = ar.hours_attended ?? (ar.attended ? ar.duration_hours : 0);
    return {
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      timestamp: d.getTime(),
      hours: importedAtt != null && attRecords.length === 1 ? importedAtt : hours,
    };
  });

  if (sessionTrend.length === 0 && importedAtt != null) {
    sessionTrend.push({
      date: 'Overall',
      timestamp: Date.now(),
      hours: importedAtt,
    });
  }

  const assignments = assignRows.map(a => ({
    name: a.assignment_name,
    due: a.due_date
      ? new Date(
          a.due_date.includes('T') ? a.due_date : `${a.due_date}T00:00:00`,
        ).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })
      : '—',
    status: a.status,
  }));

  const quizChart = quizRows.map((q, i) => ({
    name: q.quiz_name || `Quiz ${i + 1}`,
    score: Math.round(q.percentage ?? q.score),
  }));

  return { summary, sessionTrend, assignments, quizChart };
}
