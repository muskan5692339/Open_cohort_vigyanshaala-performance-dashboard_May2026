import type { ColumnMapping } from '../types/dynamicSchema';
import type { ParsedStudent } from '../types/syncTypes';
import type { ParsedExcelPayload } from './loadMetricsFromParsedExcel';
import type { ClassWiseAttendanceEntry } from './classWiseAttendance';
import {
  attendedPreRecordedHours,
  countAttendedSessions,
  countMissedSessions,
  totalAttendedProgramHours,
  totalPreRecordedCreditHours,
  totalProgramHoursFromClassWise,
  totalSessionHours,
} from './classWiseAttendance';
import { parsePercentOrScore, resolveWideFormatColumnHeaders } from './excelParser';
import { normalizeExcelCell } from './excelCellValue';
import {
  buildStudentAssignmentItems,
  isAssignmentAccepted,
  isAssignmentSubmitted,
  type StudentAssignmentItem,
} from './studentAssignmentDisplay';
import { normalizeStudentEmail } from './studentEmailLookup';
import {
  computeProgramOverview,
  listAssignmentColumns,
  listQuizColumns,
} from './programOverviewMetrics';
import { findInterventionColumn } from './weeklyAdminMetrics';
import { mergeAssessmentColumns, buildQuizBarData } from './assessmentColumnOrder';

function stringifyCellValue(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string' && v.trim().startsWith('{"formula"')) {
    return normalizeExcelCell(JSON.parse(v) as unknown);
  }
  return normalizeExcelCell(v);
}

function parsePct(raw: unknown): number {
  return parsePercentOrScore(stringifyCellValue(raw));
}

function parsePctOrNull(raw: unknown): number | null {
  const text = stringifyCellValue(raw);
  if (!text.trim()) return null;
  if (!text.match(/-?\d+(\.\d+)?/)) return null;
  return parsePct(raw);
}

function rowAsStrings(row: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = stringifyCellValue(value);
  }
  return out;
}

function getByKeywords(row: Record<string, unknown>, keywords: string[]): string {
  const entries = Object.entries(row);
  for (const keyword of keywords) {
    const target = keyword.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const [key, value] of entries) {
      const nk = key.replace(/^\uFEFF/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (nk === target) {
        const out = stringifyCellValue(value);
        if (out) return out;
      }
    }
  }
  for (const keyword of keywords) {
    for (const [key, value] of entries) {
      const lk = key.toLowerCase();
      if (lk.includes(keyword)) {
        if (keyword === 'name') {
          const nk = key.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (nk !== 'name' && nk !== 'fullname' && nk !== 'studentname') continue;
        }
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

function resolveWorkbookHeaders(
  payload: ParsedExcelPayload,
  matched: Record<string, unknown>,
  mapping: ColumnMapping,
): string[] {
  const fromRows = (payload.rawRows ?? []).flatMap(row => Object.keys(row));
  return [...new Set([
    ...(payload.headers ?? []),
    ...fromRows,
    ...Object.keys(mapping),
    ...(payload.discoveredColumns?.map(c => c.name) ?? []),
    ...Object.keys(matched),
  ].filter(Boolean))];
}

function mergeAssignmentColumns(
  headers: string[],
  mapping: ColumnMapping,
  payload: ParsedExcelPayload,
): string[] {
  const wide = resolveWideFormatColumnHeaders(headers);
  return mergeAssessmentColumns([
    listAssignmentColumns(headers, mapping, payload.discoveredColumns),
    wide.assignmentHeaders,
  ], headers);
}

function mergeQuizColumns(
  headers: string[],
  mapping: ColumnMapping,
  payload: ParsedExcelPayload,
): string[] {
  const wide = resolveWideFormatColumnHeaders(headers);
  return mergeAssessmentColumns([
    listQuizColumns(headers, mapping, payload.discoveredColumns),
    wide.quizHeaders,
  ], headers);
}

function assignmentSubmissionPctFromRow(
  matched: Record<string, unknown>,
  assignmentCols: string[],
): number {
  if (!assignmentCols.length) return 0;
  let submitted = 0;
  for (const col of assignmentCols) {
    const val = stringifyCellValue(matched[col]);
    if (val && isAssignmentSubmitted(val)) submitted++;
  }
  return Math.round((submitted / assignmentCols.length) * 100);
}

/** Accepted / total assignment slots — rejected and pending do not count. */
function assignmentAcceptancePctFromRow(
  matched: Record<string, unknown>,
  assignmentCols: string[],
): number {
  if (!assignmentCols.length) return 0;
  let accepted = 0;
  for (const col of assignmentCols) {
    const val = stringifyCellValue(matched[col]);
    if (val && isAssignmentAccepted(val)) accepted++;
  }
  return Math.round((accepted / assignmentCols.length) * 100);
}

export function findFinalScoreColumn(headers: string[]): string | null {
  const wide = resolveWideFormatColumnHeaders(headers);
  if (wide.finalScoreHeader) return wide.finalScoreHeader;
  for (const col of headers) {
    const l = col.toLowerCase();
    if (
      l.includes('final score')
      || l.includes('final selection')
      || l.includes('final assessment')
    ) {
      return col;
    }
  }
  return null;
}

export interface StudentDashboardView {
  profile: {
    name: string;
    id: string;
    email: string;
    phone: string;
    course: string;
    year: string;
    cohort: string;
    college: string;
    studentCategory: string;
    certificateStatus: string;
  };
  attendancePct: number;
  missedAttendancePct: number;
  assignmentSubmissionPct: number;
  assignmentAcceptancePct: number;
  avgQuiz: number;
  quizHighest: number;
  finalScore: number | null;
  finalScoreLabel: string | null;
  engagementScore: number;
  engagementLabel: string;
  quizBarData: { name: string; score: number | null; display: string }[];
  assignmentRows: StudentAssignmentItem[];
  programHoursLabel: string;
  sessions: number;
  attendedSessionCount: number;
  missedSessionCount: number;
  attendedHours: number;
  totalHours: number;
  liveHours: number;
  preRecordedHours: number;
  preRecordedTotalHours: number;
}

export function buildStudentDashboardView(input: {
  payload: ParsedExcelPayload;
  email: string;
  student: ParsedStudent;
  matched: Record<string, unknown>;
  mapping: ColumnMapping;
  classWise?: ClassWiseAttendanceEntry | null;
}): StudentDashboardView {
  const { payload, student, matched, mapping, classWise } = input;
  const headers = resolveWorkbookHeaders(payload, matched, mapping);
  const stringRow = rowAsStrings(matched);
  const rawRows = (payload.rawRows ?? []).map(r => ({ ...r }));

  const overviewRecord = computeProgramOverview(rawRows, headers, mapping).students.find(
    s => normalizeStudentEmail(s.email) === normalizeStudentEmail(input.email),
  );

  const assignmentCols = mergeAssignmentColumns(headers, mapping, payload);
  const quizCols = mergeQuizColumns(headers, mapping, payload);
  const finalScoreCol = findFinalScoreColumn(headers);

  const rowAttendancePctCols = headers.filter(col => {
    const l = col.toLowerCase().replace(/\s+/g, ' ').trim();
    if (l.includes('eligible') || l.includes('> 70') || l.includes('>=70')) return false;
    return (l.includes('attendance') && (l.includes('%') || l.includes('percent') || l.includes('pct')))
      || l === 'attendance %'
      || l.includes('attendance percent')
      || l.includes('attendance percentage');
  });
  const attendancePctCol = rowAttendancePctCols[0]
    ?? headers.find(col => {
      const nk = col.toLowerCase().replace(/[^a-z0-9%]/g, '');
      return nk === 'attendance%' || nk === 'attendancepct' || nk === 'attendancepercent';
    });

  const sheetAttendancePct = attendancePctCol
    ? parsePctOrNull(matched[attendancePctCol])
    : (student.imported_attendance_pct != null
      ? Math.round(student.imported_attendance_pct * 100) / 100
      : overviewRecord?.attendancePct ?? null);

  const classesAttendedRaw = getByKeywords(matched, [
    'no. of classes attended',
    'classes attended',
    'no of classes attended',
  ]);
  const totalClassesRaw = getByKeywords(matched, ['program hours', 'total classes', 'no. of classes', 'sessions']);
  const programHoursFromRow = getByKeywords(matched, ['program hours', 'programme hours', 'total hours']);

  const sessions = classWise
    ? classWise.sessions.length
    : Math.max(0, parseInt(classesAttendedRaw, 10) || parseInt(totalClassesRaw, 10) || 0);
  const attendedSessionCount = classWise
    ? countAttendedSessions(classWise)
    : Math.max(0, parseInt(classesAttendedRaw, 10) || 0);
  const missedSessionCount = classWise
    ? countMissedSessions(classWise)
    : Math.max(0, sessions - attendedSessionCount);

  // Live (each class capped at 1 hr) + pre-recorded video hours.
  const liveHours = classWise ? totalSessionHours(classWise) : 0;
  const preRecordedTotalHours = classWise ? totalPreRecordedCreditHours(classWise) : 0;
  const preRecordedHours = classWise ? attendedPreRecordedHours(classWise) : 0;
  const attendedHours = classWise ? totalAttendedProgramHours(classWise) : 0;
  const totalHours = classWise
    ? totalProgramHoursFromClassWise(classWise)
    : 0;

  // Prefer Attendance % from the performance sheet. Do not override with hours-based session math.
  let attendancePct = sheetAttendancePct ?? 0;
  if (attendancePct === 0 && student.imported_attendance_pct != null && student.imported_attendance_pct > 0) {
    attendancePct = Math.round(student.imported_attendance_pct * 100) / 100;
  }
  if (attendancePct === 0 && sessions > 0) {
    attendancePct = Math.round((attendedSessionCount / sessions) * 100);
  }

  const missedAttendancePct = Math.max(0, Math.round((100 - attendancePct) * 100) / 100);

  const rowSubmissionPct = assignmentSubmissionPctFromRow(matched, assignmentCols);
  const rowAcceptancePct = assignmentAcceptancePctFromRow(matched, assignmentCols);
  // Prefer live row columns for every student so rejected ≠ full credit.
  const assignmentSubmissionPct = assignmentCols.length
    ? rowSubmissionPct
    : (overviewRecord?.assignmentSubmissionPct
      ?? (student.imported_assignment_pct != null
        ? Math.round(student.imported_assignment_pct)
        : 0));
  const assignmentAcceptancePct = assignmentCols.length
    ? rowAcceptancePct
    : (overviewRecord?.assignmentAcceptancePct ?? assignmentSubmissionPct);

  const studentCategoryForQuiz = stringRow['student_category']?.trim()
    || stringRow['Student Category']?.trim()
    || '';

  const quizBarData = buildQuizBarData(quizCols, stringRow, studentCategoryForQuiz);

  const numericQuizScores = quizBarData
    .map(q => q.score)
    .filter((s): s is number => s != null);
  const avgQuiz = numericQuizScores.length
    ? Math.round(numericQuizScores.reduce((a, b) => a + b, 0) / numericQuizScores.length)
    : (overviewRecord?.quizScoreAvg
      ?? (student.imported_quiz_pct != null ? Math.round(student.imported_quiz_pct) : 0));
  const quizHighest = numericQuizScores.length
    ? Math.max(...numericQuizScores)
    : avgQuiz;

  const finalScore = finalScoreCol ? parsePctOrNull(matched[finalScoreCol]) : null;
  const finalScoreLabel = finalScoreCol?.replace(/_/g, ' ').trim() ?? null;

  // Engagement uses acceptance (rejected work should not count as full credit).
  const engagementScore = Math.round(
    attendancePct * 0.4 + assignmentAcceptancePct * 0.4 + avgQuiz * 0.2,
  );
  const engagementLabel =
    engagementScore >= 70 ? 'High Engagement'
      : engagementScore >= 40 ? 'Medium Engagement'
        : 'Low Engagement';

  const assignmentRows = assignmentCols.length
    ? buildStudentAssignmentItems(matched, assignmentCols, headers)
    : (payload.assignments ?? [])
        .filter(a => normalizeStudentEmail(a.student_email) === normalizeStudentEmail(student.email))
        .slice(0, 12)
        .map(a => ({
          name: a.assignment_name,
          date: a.due_date
            ? new Date(a.due_date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })
            : '—',
          status: a.status,
          feedback: '',
          kind: a.status.toLowerCase().includes('submit') ? 'accepted' as const : 'pending' as const,
        }));

  const programHoursLabel =
    totalHours > 0
      ? `${attendedHours.toFixed(2)} / ${totalHours} hrs (${sessions} live + ${preRecordedTotalHours} pre)`
      : attendancePctCol
        ? 'From Attendance %'
        : attendedSessionCount > 0 || sessions > 0
          ? `${attendedSessionCount} / ${sessions} sessions`
          : programHoursFromRow !== '—'
            ? programHoursFromRow
            : '—';

  const categoryCol = findInterventionColumn(headers, mapping);
  const studentCategory = categoryCol
    ? (stringRow[categoryCol]?.trim() || '—')
    : resolveField(matched, undefined, [
      'student_cat',
      'student category',
      'college category',
      'institution category',
      'intervention group',
    ]);

  return {
    profile: {
      name: resolveField(matched, student.name, ['full name', 'student name', 'name']),
      id: resolveField(matched, student.student_id, ['student id', 'student_id', 'vs id', 'id']),
      email: resolveField(matched, student.email, ['email', 'email address', 'e-mail']),
      phone: resolveField(matched, undefined, ['phone', 'mobile', 'contact']),
      course: resolveField(matched, student.program, [
        'currently_pursuing_degree',
        'currently pursuing degree',
        'course',
        'program',
        'programme',
        'program name',
        'degree',
        'subject area',
        'subject',
      ]),
      year: resolveField(matched, undefined, [
        'current pursuing year',
        'pursuing year',
        'current year',
        'academic year',
        'year of study',
        'year',
      ]),
      cohort: resolveField(matched, student.cohort || payload.cohortName, ['cohort', 'batch', 'program cohort']),
      college: resolveField(matched, student.college, [
        'name_of_college_university',
        'name of college university',
        'college',
        'university',
        'institution',
      ]),
      studentCategory,
      certificateStatus: resolveField(matched, student.certificate_status, [
        'certificate status',
        'certificate sent',
        'cert status',
        'certificate',
        'certification',
      ]),
    },
    attendancePct,
    missedAttendancePct,
    assignmentSubmissionPct,
    assignmentAcceptancePct,
    avgQuiz,
    quizHighest,
    finalScore,
    finalScoreLabel,
    engagementScore,
    engagementLabel,
    quizBarData,
    assignmentRows,
    programHoursLabel,
    sessions,
    attendedSessionCount,
    missedSessionCount,
    attendedHours,
    totalHours,
    liveHours,
    preRecordedHours,
    preRecordedTotalHours,
  };
}
