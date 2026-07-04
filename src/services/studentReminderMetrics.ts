import type { ColumnMapping } from '../types/dynamicSchema';
import type { ParsedExcelPayload } from './loadMetricsFromParsedExcel';
import {
  computeHoursBasedAttendance,
  countAttendedSessions,
  getClassWiseAttendanceForStudent,
  parseProgramHours,
} from './classWiseAttendance';
import { normalizeExcelCell } from './excelCellValue';
import {
  enrichPayloadForStudentLookup,
  getAllStudentEmails,
  lookupStudentByEmail,
} from './studentEmailLookup';

export type StudentReminderReason = 'attendance' | 'assignment' | 'quiz';

export interface ReminderThresholds {
  /** Send reminder when attendance % is below this value. */
  attendanceBelow: number;
  /** Send reminder when average quiz % is below this (and quiz columns exist). */
  quizBelow: number;
}

export const DEFAULT_REMINDER_THRESHOLDS: ReminderThresholds = {
  attendanceBelow: 70,
  quizBelow: 50,
};

export interface StudentReminderSnapshot {
  email: string;
  name: string;
  cohortName: string;
  attendancePct: number;
  assignmentPct: number;
  avgQuiz: number;
  pendingAssignments: string[];
  reasons: StudentReminderReason[];
}

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
  const s = value.toLowerCase().trim();
  if (!s) return true;
  return ['pending', 'no submission', 'not submission', 'in progress', 'awaiting'].some(k => s.includes(k));
}

function normalizeColumnKey(key: string): string {
  return key.replace(/^\uFEFF/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getByKeywords(row: Record<string, unknown>, keywords: string[]): string {
  for (const [key, val] of Object.entries(row)) {
    const nk = normalizeColumnKey(key);
    if (keywords.some(kw => nk.includes(normalizeColumnKey(kw)))) {
      const text = stringifyCellValue(val);
      if (text) return text;
    }
  }
  return '—';
}

function resolveField(row: Record<string, unknown>, fallback: string | undefined, keywords: string[]): string {
  const fromRow = getByKeywords(row, keywords);
  if (fromRow !== '—') return fromRow;
  return fallback?.trim() || '—';
}

function getMappedColumns(
  mapping: ColumnMapping,
  predicate: (entry: ColumnMapping[string], col: string) => boolean,
): string[] {
  return Object.keys(mapping).filter(col => predicate(mapping[col], col));
}

export function buildStudentReminderSnapshot(
  payload: ParsedExcelPayload,
  email: string,
  thresholds: ReminderThresholds = DEFAULT_REMINDER_THRESHOLDS,
): StudentReminderSnapshot | null {
  const enriched = enrichPayloadForStudentLookup(payload);
  const lookup = lookupStudentByEmail(enriched, email);
  if (!lookup?.student) return null;

  const matched = lookup.rawRow ?? {};
  const mapping = (enriched.mapping ?? {}) as ColumnMapping;
  const student = lookup.student;
  const classWise = getClassWiseAttendanceForStudent(enriched, email);

  const mappedAssignmentCols = getMappedColumns(mapping, (entry, col) =>
    entry.mappedRole === 'assignment' || col.toLowerCase().includes('assignment'));
  const rowAssignmentCols = Object.keys(matched).filter(col => {
    const l = col.toLowerCase();
    return l.includes('assignment') || ['swot', 'resume', 'career exploration', 'career planner', 'vision board', 'endline'].some(k => l.includes(k));
  });
  const assignmentCols = Array.from(new Set([...mappedAssignmentCols, ...rowAssignmentCols]));

  const mappedQuizCols = getMappedColumns(mapping, (entry, col) =>
    entry.mappedRole === 'assessment' || col.toLowerCase().includes('quiz'));
  const rowQuizCols = Object.keys(matched).filter(col => col.toLowerCase().includes('quiz'));
  const quizCols = Array.from(new Set([...mappedQuizCols, ...rowQuizCols]));
  const quizScoreCols = quizCols.filter(col => !col.toLowerCase().includes('final score'));

  const rowAttendancePctCols = Object.keys(matched).filter(col => {
    const l = col.toLowerCase();
    return (l.includes('attendance') && l.includes('%')) || l.includes('attendance percent');
  });
  const attendanceCols = getMappedColumns(mapping, (entry, col) =>
    entry.mappedRole === 'attendance' || col.toLowerCase().includes('attendance'));
  const attendancePctCol = rowAttendancePctCols[0]
    ?? attendanceCols.find(col => col.toLowerCase().includes('%'))
    ?? attendanceCols[0];

  const programHoursFromRow = getByKeywords(matched, ['program hours', 'programme hours', 'total hours']);
  const programHoursParsed = parseProgramHours(programHoursFromRow);
  const sessionSlotCount = classWise?.sessions.length ?? 0;
  const totalProgramHours =
    sessionSlotCount > 0 ? sessionSlotCount : programHoursParsed ?? null;

  const sessions = classWise
    ? classWise.sessions.length
    : Math.max(0, parseInt(getByKeywords(matched, ['program hours', 'total classes', 'no. of classes', 'sessions']), 10) || 0);
  const attendedSessionCount = classWise ? countAttendedSessions(classWise) : 0;
  const hoursAttendance = classWise ? computeHoursBasedAttendance(classWise, totalProgramHours) : null;
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

  const pendingAssignments: string[] = assignmentCols.length
    ? assignmentCols
        .filter(col => isPending(stringifyCellValue(matched[col])))
        .map(col => col.replace(/_/g, ' ').trim())
    : (enriched.assignments ?? [])
        .filter(a => a.student_email.toLowerCase() === email.toLowerCase() && !isAccepted(a.status))
        .map(a => a.assignment_name);

  const assignmentPct = assignmentCols.length
    ? Math.round((assignmentCols.filter(col => isAccepted(stringifyCellValue(matched[col]))).length / assignmentCols.length) * 100) || 0
    : (() => {
        const rows = (enriched.assignments ?? []).filter(a => a.student_email.toLowerCase() === email.toLowerCase());
        if (!rows.length) return 100;
        const done = rows.filter(a => isAccepted(a.status)).length;
        return Math.round((done / rows.length) * 100);
      })();

  const quizScores = quizScoreCols.map(col => parsePct(matched[col]));
  const avgQuiz = quizScoreCols.length
    ? Math.round(quizScores.reduce((a, b) => a + b, 0) / quizScoreCols.length)
    : student.imported_quiz_pct != null
      ? Math.round(student.imported_quiz_pct)
      : -1;

  const reasons: StudentReminderReason[] = [];
  if (attendancePct < thresholds.attendanceBelow) reasons.push('attendance');
  if (assignmentPct < 100 || pendingAssignments.length > 0) reasons.push('assignment');
  if (quizScoreCols.length > 0 && avgQuiz >= 0 && avgQuiz < thresholds.quizBelow) reasons.push('quiz');

  const name = resolveField(matched, student.name, ['full name', 'name', 'student name']);

  return {
    email,
    name: name !== '—' ? name : email,
    cohortName: enriched.cohortName ?? 'Open Cohort',
    attendancePct,
    assignmentPct,
    avgQuiz: Math.max(0, avgQuiz),
    pendingAssignments,
    reasons,
  };
}

export function listStudentsNeedingReminders(
  payload: ParsedExcelPayload,
  thresholds: ReminderThresholds = DEFAULT_REMINDER_THRESHOLDS,
): StudentReminderSnapshot[] {
  const enriched = enrichPayloadForStudentLookup(payload);
  const emails = getAllStudentEmails(enriched);
  const out: StudentReminderSnapshot[] = [];
  for (const email of emails) {
    const snap = buildStudentReminderSnapshot(enriched, email, thresholds);
    if (snap && snap.reasons.length > 0) out.push(snap);
  }
  return out;
}

export function buildReminderEmail(snapshot: StudentReminderSnapshot, dashboardUrl: string): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = 'She for STEM — weekly progress reminder';
  const lines: string[] = [`Hi ${snapshot.name},`, ''];

  if (snapshot.reasons.includes('attendance')) {
    lines.push(`• Attendance: ${snapshot.attendancePct.toFixed(1)}% — please catch up on live sessions and pre-recorded videos.`);
  }
  if (snapshot.reasons.includes('assignment')) {
    const pending = snapshot.pendingAssignments.length
      ? snapshot.pendingAssignments.slice(0, 5).join(', ')
      : 'one or more assignments';
    lines.push(`• Assignments: ${snapshot.assignmentPct}% complete — pending: ${pending}.`);
  }
  if (snapshot.reasons.includes('quiz')) {
    lines.push(`• Quizzes: average score ${snapshot.avgQuiz}% — please attempt open quizzes when available.`);
  }

  lines.push('', `View your dashboard: ${dashboardUrl}`, '', '— VigyanShaala She for STEM team');

  const text = lines.join('\n');
  const html = [
    `<p>Hi ${escapeHtml(snapshot.name)},</p>`,
    '<p>Here is a quick summary from your performance dashboard:</p>',
    '<ul>',
    ...lines.filter(l => l.startsWith('•')).map(l => `<li>${escapeHtml(l.slice(2))}</li>`),
    '</ul>',
    `<p><a href="${escapeHtml(dashboardUrl)}">Open your student dashboard</a></p>`,
    '<p>— VigyanShaala She for STEM team</p>',
  ].join('\n');

  return { subject, text, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function isoWeekKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
