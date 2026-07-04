/**
 * Server-only reminder metrics (no imports from src/ — Vercel-safe bundle).
 */

interface ParsedStudent {
  student_id?: string;
  name?: string;
  email: string;
  imported_attendance_pct?: number | null;
  imported_quiz_pct?: number | null;
}

interface ParsedAssignment {
  student_email: string;
  assignment_name: string;
  status: string;
}

export interface ReminderPayload {
  cohortName: string;
  fileName: string;
  students?: ParsedStudent[];
  attendance?: unknown[];
  assignments?: ParsedAssignment[];
  quiz?: unknown[];
  rawRows?: Record<string, string>[];
  headers?: string[];
  mapping?: Record<string, { mappedRole?: string; mappedType?: string }>;
  classWiseAttendance?: ClassWiseEntry[];
  classWiseAttendanceColumns?: string[];
}

type ClassWiseSession = { key: string; hours: number };
type ClassWiseEntry = {
  student_email: string;
  student_name?: string;
  sessions: ClassWiseSession[];
  preRecorded?: ClassWiseSession[];
};

function normalizeStudentEmail(email: string): string {
  return email.trim().toLowerCase().replace(/^mailto:/i, '').trim();
}

function isValidStudentEmail(email: string): boolean {
  const normalized = normalizeStudentEmail(email);
  return normalized.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

function normalizeExcelCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v).trim();
  if (typeof v === 'object' && v) {
    const cell = v as Record<string, unknown>;
    if (cell.result !== undefined && cell.result !== null) return normalizeExcelCell(cell.result);
    if (typeof cell.text === 'string') return cell.text.trim();
  }
  return String(v).trim();
}

function cellText(v: unknown): string {
  const raw = normalizeExcelCell(v);
  return normalizeStudentEmail(raw) || raw;
}

function columnNamesFromPayload(payload: ReminderPayload): string[] {
  const mapping = payload.mapping ?? {};
  const fromRowKeys = payload.rawRows?.length ? Object.keys(payload.rawRows[0]) : [];
  return [...new Set([...Object.keys(mapping), ...(payload.headers ?? []), ...fromRowKeys])];
}

function isEmailHeaderName(header: string): boolean {
  const l = header.toLowerCase().replace(/^\uFEFF/, '').trim();
  return l === 'email' || l.includes('email') || l.includes('mail id') || l.includes('mailid');
}

function resolveEmailColumnKey(payload: ReminderPayload): string | null {
  const names = columnNamesFromPayload(payload);
  const exact = names.find(n => n.toLowerCase().replace(/^\uFEFF/, '').trim() === 'email');
  if (exact) return exact;
  const mapping = payload.mapping ?? {};
  const fromMapping = names.filter(n => mapping[n]?.mappedType === 'identifier' || isEmailHeaderName(n));
  if (fromMapping.length) return fromMapping[0];
  return names.find(n => isEmailHeaderName(n)) ?? null;
}

function getAllStudentEmails(payload: ReminderPayload | null | undefined): string[] {
  if (!payload) return [];
  const byNormalized = new Map<string, string>();
  for (const student of payload.students ?? []) {
    const email = cellText(student.email);
    if (isValidStudentEmail(email)) byNormalized.set(normalizeStudentEmail(email), email);
  }
  const col = resolveEmailColumnKey(payload);
  for (const row of payload.rawRows ?? []) {
    const email = col ? cellText(row[col]) : '';
    const resolved = isValidStudentEmail(email) ? email : '';
    if (!resolved) {
      for (const val of Object.values(row)) {
        const candidate = cellText(val);
        if (isValidStudentEmail(candidate)) {
          byNormalized.set(normalizeStudentEmail(candidate), candidate);
        }
      }
      continue;
    }
    byNormalized.set(normalizeStudentEmail(resolved), resolved);
  }
  for (const entry of payload.classWiseAttendance ?? []) {
    const email = cellText(entry.student_email);
    if (isValidStudentEmail(email)) byNormalized.set(normalizeStudentEmail(email), email);
  }
  return [...byNormalized.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

function buildStudentFromRow(row: Record<string, unknown>, payload: ReminderPayload, email: string): ParsedStudent {
  const name = Object.entries(row).find(([k]) => /name/i.test(k))?.[1];
  return {
    student_id: normalizeStudentEmail(email),
    name: cellText(name) || 'Unknown',
    email,
    college: '',
    program: '',
    cohort: payload.cohortName,
    state: '',
    status: 'Active',
  };
}

function enrichPayloadForStudentLookup(payload: ReminderPayload): ReminderPayload {
  const students = [...(payload.students ?? [])];
  const seen = new Set(students.map(s => normalizeStudentEmail(s.email)).filter(Boolean));
  for (const row of payload.rawRows ?? []) {
    const col = resolveEmailColumnKey(payload);
    let email = col ? cellText(row[col]) : '';
    if (!isValidStudentEmail(email)) {
      for (const val of Object.values(row)) {
        const candidate = cellText(val);
        if (isValidStudentEmail(candidate)) { email = candidate; break; }
      }
    }
    if (!isValidStudentEmail(email)) continue;
    const key = normalizeStudentEmail(email);
    if (seen.has(key)) continue;
    seen.add(key);
    students.push(buildStudentFromRow(row, payload, email));
  }
  for (const entry of payload.classWiseAttendance ?? []) {
    const email = cellText(entry.student_email);
    if (!isValidStudentEmail(email)) continue;
    const key = normalizeStudentEmail(email);
    if (seen.has(key)) continue;
    seen.add(key);
    students.push({
      student_id: key,
      name: entry.student_name?.trim() || 'Unknown',
      email,
      college: '',
      program: '',
      cohort: payload.cohortName,
      state: '',
      status: 'Active',
    });
  }
  return { ...payload, students };
}

function findStudentRawRow(payload: ReminderPayload, email: string): Record<string, unknown> | null {
  const key = normalizeStudentEmail(email);
  const col = resolveEmailColumnKey(payload);
  for (const row of payload.rawRows ?? []) {
    if (col && normalizeStudentEmail(cellText(row[col])) === key) return row;
    for (const val of Object.values(row)) {
      if (normalizeStudentEmail(cellText(val)) === key) return row;
    }
  }
  return null;
}

function lookupStudentByEmail(payload: ReminderPayload | null | undefined, email: string) {
  if (!payload) return null;
  const key = normalizeStudentEmail(email);
  let student = payload.students?.find(s => normalizeStudentEmail(s.email) === key);
  if (!student) {
    const row = findStudentRawRow(payload, email);
    if (row) student = buildStudentFromRow(row, payload, email);
  }
  if (!student) return null;
  return { student, rawRow: findStudentRawRow(payload, email) };
}

function getClassWiseAttendanceForStudent(payload: ReminderPayload | null | undefined, email: string): ClassWiseEntry | undefined {
  if (!payload?.classWiseAttendance?.length) return undefined;
  const key = normalizeStudentEmail(email);
  return payload.classWiseAttendance.find(e => normalizeStudentEmail(e.student_email) === key);
}

function normalizeSessionHours(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  return Math.min(1, hours);
}

function countAttendedSessions(entry: ClassWiseEntry): number {
  return entry.sessions.filter(s => normalizeSessionHours(s.hours) > 0).length;
}

function totalSessionHours(entry: ClassWiseEntry): number {
  return Math.round(entry.sessions.reduce((sum, s) => sum + normalizeSessionHours(s.hours), 0) * 100) / 100;
}

function parseProgramHours(raw: string): number | null {
  const text = (raw ?? '').replace(/,/g, '').trim();
  if (!text || text === '—') return null;
  const n = parseFloat(text);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function computeHoursBasedAttendance(entry: ClassWiseEntry, totalProgramHours: number | null) {
  const attendedHours = totalSessionHours(entry);
  const totalHours =
    totalProgramHours && totalProgramHours > 0
      ? totalProgramHours
      : entry.sessions.length > 0
        ? entry.sessions.length
        : attendedHours;
  const missedHours = Math.max(0, Math.round((totalHours - attendedHours) * 100) / 100);
  const attendedPct = totalHours > 0 ? Math.round((attendedHours / totalHours) * 10000) / 100 : 0;
  return { attendedHours, totalHours, missedHours, attendedPct, missedPct: Math.max(0, 100 - attendedPct) };
}

export type StudentReminderReason = 'attendance' | 'assignment' | 'quiz';

export interface ReminderThresholds {
  attendanceBelow: number;
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
    try { return normalizeExcelCell(JSON.parse(v) as unknown); } catch { return v.trim(); }
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
  mapping: ReminderPayload['mapping'],
  predicate: (entry: NonNullable<ReminderPayload['mapping']>[string], col: string) => boolean,
): string[] {
  if (!mapping) return [];
  return Object.keys(mapping).filter(col => predicate(mapping[col], col));
}

export function buildStudentReminderSnapshot(
  payload: ReminderPayload,
  email: string,
  thresholds: ReminderThresholds = DEFAULT_REMINDER_THRESHOLDS,
): StudentReminderSnapshot | null {
  const enriched = enrichPayloadForStudentLookup(payload);
  const lookup = lookupStudentByEmail(enriched, email);
  if (!lookup?.student) return null;

  const matched = lookup.rawRow ?? {};
  const mapping = enriched.mapping ?? {};
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
  const totalProgramHours = sessionSlotCount > 0 ? sessionSlotCount : programHoursParsed ?? null;

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
    ? assignmentCols.filter(col => isPending(stringifyCellValue(matched[col]))).map(col => col.replace(/_/g, ' ').trim())
    : (enriched.assignments ?? [])
        .filter(a => a.student_email.toLowerCase() === email.toLowerCase() && !isAccepted(a.status))
        .map(a => a.assignment_name);

  const assignmentPct = assignmentCols.length
    ? Math.round((assignmentCols.filter(col => isAccepted(stringifyCellValue(matched[col]))).length / assignmentCols.length) * 100) || 0
    : (() => {
        const rows = (enriched.assignments ?? []).filter(a => a.student_email.toLowerCase() === email.toLowerCase());
        if (!rows.length) return 100;
        return Math.round((rows.filter(a => isAccepted(a.status)).length / rows.length) * 100);
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
  payload: ReminderPayload,
  thresholds: ReminderThresholds = DEFAULT_REMINDER_THRESHOLDS,
): StudentReminderSnapshot[] {
  const enriched = enrichPayloadForStudentLookup(payload);
  const out: StudentReminderSnapshot[] = [];
  for (const email of getAllStudentEmails(enriched)) {
    const snap = buildStudentReminderSnapshot(enriched, email, thresholds);
    if (snap && snap.reasons.length > 0) out.push(snap);
  }
  return out;
}

export function buildReminderEmail(snapshot: StudentReminderSnapshot, dashboardUrl: string) {
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
  const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

export type ReminderSlot = 'morning' | 'evening';

export function resolveReminderSlot(explicit?: string, date = new Date()): ReminderSlot {
  if (explicit === 'morning' || explicit === 'evening') return explicit;
  return date.getUTCHours() < 10 ? 'morning' : 'evening';
}

export function reminderLogKey(slot: ReminderSlot, date = new Date()): string {
  return `${isoWeekKey(date)}-${slot}`;
}

export function isoWeekKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
