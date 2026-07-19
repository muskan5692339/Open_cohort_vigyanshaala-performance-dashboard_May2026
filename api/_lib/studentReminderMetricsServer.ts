/**
 * Server-only reminder metrics (no imports from src/ — Vercel-safe bundle).
 */

interface ParsedStudent {
  student_id?: string;
  name?: string;
  email: string;
  college?: string;
  program?: string;
  cohort?: string;
  state?: string;
  status?: string;
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
  return repairStudentEmail(email.trim().toLowerCase().replace(/^mailto:/i, '').trim());
}

function repairStudentEmail(email: string): string {
  let e = email.trim().toLowerCase().replace(/^mailto:/i, '').trim();
  const ditBroken = e.match(/^(\d+)dit@edu\.in$/) ?? e.match(/^(\d+)d@edu\.in$/);
  if (ditBroken) return `${ditBroken[1]}@dit.edu.in`;
  const eduOnly = e.match(/^(\d{7,})@edu\.in$/);
  if (eduOnly) return `${eduOnly[1]}@dit.edu.in`;
  return e;
}

export function isValidStudentEmail(email: string): boolean {
  const normalized = normalizeStudentEmail(email);
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return false;
  if (/@edu\.in$/i.test(normalized)) return false;
  return true;
}

function canonicalStudentEmail(email: string): string {
  return normalizeStudentEmail(email);
}

function resolveDeliverableEmailFromRow(
  row: Record<string, unknown>,
  emailCol: string | null,
  fallback?: string,
): string | null {
  const candidates: string[] = [];
  if (fallback) candidates.push(fallback);
  if (emailCol) candidates.push(cellText(row[emailCol]));
  for (const val of Object.values(row)) {
    const t = cellText(val);
    if (t.includes('@')) candidates.push(t);
  }
  let fallbackValid: string | null = null;
  for (const raw of candidates) {
    const canonical = normalizeStudentEmail(raw);
    if (!isValidStudentEmail(canonical)) continue;
    if (canonical.endsWith('@dit.edu.in')) return canonical;
    if (!fallbackValid) fallbackValid = canonical;
  }
  return fallbackValid;
}

function addDeliverableEmail(map: Map<string, string>, raw: string): void {
  const canonical = normalizeStudentEmail(raw);
  if (isValidStudentEmail(canonical)) map.set(canonical, canonical);
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
  const col = resolveEmailColumnKey(payload);
  for (const student of payload.students ?? []) {
    addDeliverableEmail(byNormalized, student.email);
  }
  for (const row of payload.rawRows ?? []) {
    const resolved = resolveDeliverableEmailFromRow(row, col);
    if (resolved) byNormalized.set(resolved, resolved);
  }
  for (const entry of payload.classWiseAttendance ?? []) {
    addDeliverableEmail(byNormalized, entry.student_email);
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

function buildEmailRowIndex(payload: ReminderPayload): Map<string, Record<string, unknown>> {
  const index = new Map<string, Record<string, unknown>>();
  const col = resolveEmailColumnKey(payload);
  for (const row of payload.rawRows ?? []) {
    if (col) {
      const email = cellText(row[col]);
      if (isValidStudentEmail(email)) {
        index.set(normalizeStudentEmail(email), row);
        continue;
      }
    }
    for (const val of Object.values(row)) {
      const email = cellText(val);
      if (!isValidStudentEmail(email)) continue;
      const key = normalizeStudentEmail(email);
      if (!index.has(key)) index.set(key, row);
    }
  }
  return index;
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

function lookupStudentByEmail(
  payload: ReminderPayload | null | undefined,
  email: string,
  rowIndex?: Map<string, Record<string, unknown>>,
) {
  if (!payload) return null;
  const key = normalizeStudentEmail(email);
  let student = payload.students?.find(s => normalizeStudentEmail(s.email) === key);
  const row = rowIndex?.get(key) ?? findStudentRawRow(payload, email);
  if (!student && row) student = buildStudentFromRow(row, payload, email);
  if (!student) return null;
  return { student, rawRow: row };
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
  quizBelow: 90,
};

export type AssignmentReminderStatus = 'no_submission' | 'rejected';
export type QuizReminderKind = 'not_attempted' | 're_attempt';

export interface MissedSessionItem {
  name: string;
  kind: 'live' | 'prerecorded';
}

export interface PendingAssignmentItem {
  name: string;
  status: AssignmentReminderStatus;
}

export interface PendingQuizItem {
  name: string;
  kind: QuizReminderKind;
  score: number | null;
}

export interface StudentReminderSnapshot {
  email: string;
  name: string;
  cohortName: string;
  attendancePct: number;
  assignmentPct: number;
  avgQuiz: number;
  missedSessions: MissedSessionItem[];
  pendingAssignments: PendingAssignmentItem[];
  pendingQuizzes: PendingQuizItem[];
  reasons: StudentReminderReason[];
}

function formatColumnLabel(col: string): string {
  return col.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

function formatSessionLabel(key: string): string {
  return key
    .replace(/^\uFEFF/, '')
    .replace(/\(\s*\d{1,3}:\d{2}\s*(?:min(?:ute)?s?)?\s*\)/gi, '')
    .replace(/\(\s*\d+(?:\.\d+)?\s*m(?:in(?:ute)?s?)?\s*\)/gi, '')
    .replace(/\[\s*\d{1,3}:\d{2}\s*(?:min(?:ute)?s?)?\s*\]/gi, '')
    .replace(/\[\s*\d+(?:\.\d+)?\s*m(?:in(?:ute)?s?)?\s*\]/gi, '')
    .trim();
}

function listMissedSessions(classWise: ClassWiseEntry | undefined): MissedSessionItem[] {
  if (!classWise) return [];
  const missed: MissedSessionItem[] = [];
  for (const session of classWise.sessions) {
    if (normalizeSessionHours(session.hours) <= 0) {
      missed.push({ name: formatSessionLabel(session.key), kind: 'live' });
    }
  }
  for (const session of classWise.preRecorded ?? []) {
    if (!Number.isFinite(session.hours) || session.hours <= 0) {
      missed.push({ name: formatSessionLabel(session.key), kind: 'prerecorded' });
    }
  }
  return missed;
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

function isRejectedWithFeedback(value: string): boolean {
  const s = value.toLowerCase();
  return s.includes('rejected');
}

function isNoSubmission(value: string): boolean {
  const s = value.toLowerCase().trim();
  if (!s) return true;
  if (isRejectedWithFeedback(value) || isAccepted(value)) return false;
  return ['no submission', 'not submission', 'pending', 'in progress', 'awaiting'].some(k => s.includes(k));
}

function classifyAssignmentStatus(value: string): AssignmentReminderStatus | null {
  if (isRejectedWithFeedback(value)) return 'rejected';
  if (isNoSubmission(value)) return 'no_submission';
  return null;
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

function isInactiveStudentStatus(value: string | undefined): boolean {
  const s = (value ?? '').toLowerCase().trim();
  if (!s) return false;
  return ['dropped', 'inactive', 'left', 'withdrawn', 'exit', 'drop', 'deceased', 'dead'].some(k => s.includes(k));
}

function hasNonEmptyMetricCell(raw: unknown): boolean {
  const text = stringifyCellValue(raw).trim();
  return Boolean(text && text !== '—' && text !== '-' && text.toLowerCase() !== 'na' && text.toLowerCase() !== 'n/a');
}

function studentHasDashboardActivity(input: {
  matched: Record<string, unknown>;
  student: ParsedStudent;
  classWise: ClassWiseEntry | undefined;
  assignmentCols: string[];
  quizScoreCols: string[];
  attendancePctCol: string | undefined;
  enriched: ReminderPayload;
  email: string;
}): boolean {
  const { matched, student, classWise, assignmentCols, quizScoreCols, attendancePctCol, enriched, email } = input;

  if (isInactiveStudentStatus(student.status)) return false;
  const rowStatus = getByKeywords(matched, ['status', 'student status', 'active status']);
  if (rowStatus !== '—' && isInactiveStudentStatus(rowStatus)) return false;

  if (classWise) {
    const hasLiveAttendance = classWise.sessions.some(s => normalizeSessionHours(s.hours) > 0);
    const hasPreAttendance = (classWise.preRecorded ?? []).some(s => Number.isFinite(s.hours) && s.hours > 0);
    if (hasLiveAttendance || hasPreAttendance) return true;
  }

  if (student.imported_attendance_pct != null && student.imported_attendance_pct > 0) return true;
  if (attendancePctCol && parsePct(matched[attendancePctCol]) > 0) return true;

  if (student.imported_quiz_pct != null && student.imported_quiz_pct > 0) return true;
  for (const col of quizScoreCols) {
    const raw = stringifyCellValue(matched[col]);
    if (!hasNonEmptyMetricCell(raw)) continue;
    if (parsePct(raw) > 0) return true;
  }

  for (const col of assignmentCols) {
    if (isAccepted(stringifyCellValue(matched[col]))) return true;
  }
  const assignmentRows = (enriched.assignments ?? []).filter(a => a.student_email.toLowerCase() === email.toLowerCase());
  if (assignmentRows.some(a => isAccepted(a.status))) return true;

  return false;
}

export function buildStudentReminderSnapshot(
  payload: ReminderPayload,
  email: string,
  thresholds: ReminderThresholds = DEFAULT_REMINDER_THRESHOLDS,
): StudentReminderSnapshot | null {
  return buildStudentReminderSnapshotFromEnriched(
    enrichPayloadForStudentLookup(payload),
    email,
    thresholds,
  );
}

function buildStudentReminderSnapshotFromEnriched(
  enriched: ReminderPayload,
  email: string,
  thresholds: ReminderThresholds = DEFAULT_REMINDER_THRESHOLDS,
  rowIndex?: Map<string, Record<string, unknown>>,
): StudentReminderSnapshot | null {
  const lookup = lookupStudentByEmail(enriched, email, rowIndex);
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

  const missedSessions = listMissedSessions(classWise);

  const pendingAssignments: PendingAssignmentItem[] = assignmentCols.length
    ? assignmentCols
        .map(col => {
          const status = classifyAssignmentStatus(stringifyCellValue(matched[col]));
          return status ? { name: formatColumnLabel(col), status } : null;
        })
        .filter((item): item is PendingAssignmentItem => item !== null)
    : (enriched.assignments ?? [])
        .filter(a => a.student_email.toLowerCase() === email.toLowerCase())
        .map(a => {
          const status = classifyAssignmentStatus(a.status);
          return status ? { name: a.assignment_name, status } : null;
        })
        .filter((item): item is PendingAssignmentItem => item !== null);

  const assignmentPct = assignmentCols.length
    ? Math.round((assignmentCols.filter(col => isAccepted(stringifyCellValue(matched[col]))).length / assignmentCols.length) * 100) || 0
    : (() => {
        const rows = (enriched.assignments ?? []).filter(a => a.student_email.toLowerCase() === email.toLowerCase());
        if (!rows.length) return 100;
        return Math.round((rows.filter(a => isAccepted(a.status)).length / rows.length) * 100);
      })();

  const quizScores = quizScoreCols.map(col => parsePct(matched[col]));
  const pendingQuizzes: PendingQuizItem[] = [];
  for (const col of quizScoreCols) {
    const raw = stringifyCellValue(matched[col]);
    const score = raw.trim() ? parsePct(raw) : null;
    const name = formatColumnLabel(col);
    if (score === null) {
      pendingQuizzes.push({ name, kind: 'not_attempted', score });
    } else if (score < thresholds.quizBelow) {
      pendingQuizzes.push({ name, kind: 're_attempt', score });
    }
  }

  const avgQuiz = quizScoreCols.length
    ? Math.round(quizScores.reduce((a, b) => a + b, 0) / quizScoreCols.length)
    : student.imported_quiz_pct != null
      ? Math.round(student.imported_quiz_pct)
      : -1;

  const reasons: StudentReminderReason[] = [];
  if (attendancePct < thresholds.attendanceBelow) reasons.push('attendance');
  if (pendingAssignments.length > 0) reasons.push('assignment');
  if (quizScoreCols.length > 0 && pendingQuizzes.length > 0) reasons.push('quiz');

  if (!studentHasDashboardActivity({
    matched,
    student,
    classWise,
    assignmentCols,
    quizScoreCols,
    attendancePctCol,
    enriched,
    email,
  })) {
    return null;
  }

  const name = resolveField(matched, student.name, ['full name', 'name', 'student name']);
  const deliverEmail =
    resolveDeliverableEmailFromRow(matched, resolveEmailColumnKey(enriched), student.email)
    ?? normalizeStudentEmail(email);
  if (!isValidStudentEmail(deliverEmail)) return null;

  return {
    email: deliverEmail,
    name: name !== '—' ? name : deliverEmail,
    cohortName: enriched.cohortName ?? 'Open Cohort',
    attendancePct,
    assignmentPct,
    avgQuiz: Math.max(0, avgQuiz),
    missedSessions,
    pendingAssignments,
    pendingQuizzes,
    reasons,
  };
}

export function listStudentsNeedingReminders(
  payload: ReminderPayload,
  thresholds: ReminderThresholds = DEFAULT_REMINDER_THRESHOLDS,
): StudentReminderSnapshot[] {
  const enriched = enrichPayloadForStudentLookup(payload);
  const rowIndex = buildEmailRowIndex(enriched);
  const out: StudentReminderSnapshot[] = [];
  for (const email of getAllStudentEmails(enriched)) {
    const snap = buildStudentReminderSnapshotFromEnriched(enriched, email, thresholds, rowIndex);
    if (snap && snap.reasons.length > 0) out.push(snap);
  }
  return out;
}

const QUIZ_ATTEMPT_NOTE =
  'You have up to 3 attempts per quiz; the best of 3 scores is finalized on your dashboard.';

function assignmentReminderLine(item: PendingAssignmentItem): string {
  if (item.status === 'rejected') {
    return `${item.name} — Rejected with feedback: please implement the feedback and re-submit.`;
  }
  return `${item.name} — No Submission: please submit your assignment.`;
}

function quizReminderLine(quiz: PendingQuizItem): string {
  if (quiz.kind === 'not_attempted') {
    return `${quiz.name} — not attempted: please attempt this quiz. ${QUIZ_ATTEMPT_NOTE}`;
  }
  return `${quiz.name} — ${quiz.score}%: please re-attempt this quiz. ${QUIZ_ATTEMPT_NOTE}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function firstName(name: string): string {
  const part = name.trim().split(/\s+/)[0];
  return part || name;
}

function attendanceBarColor(pct: number): string {
  if (pct >= 70) return '#059669';
  if (pct >= 40) return '#d97706';
  return '#dc2626';
}

const DEFAULT_VIGYANSHAALA_APP_URL = 'https://mytribe.vigyanshaala.com';

function resolveRecordingsAppUrl(): string {
  return process.env.VIGYANSHAALA_APP_URL?.trim() || DEFAULT_VIGYANSHAALA_APP_URL;
}

function attendanceGuideHtml(recordingsAppUrl: string): string {
  const url = escapeHtml(recordingsAppUrl);
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;background:#f0f9ff;border-radius:10px;border:1px solid #bae6fd;">
      <tr><td style="padding:14px 16px;">
        <div style="font-size:13px;font-weight:700;color:#0369a1;margin-bottom:8px;">✅ Green tick on the VigyanShaala app</div>
        <ul style="margin:0;padding:0 0 0 18px;font-size:12px;color:#334155;line-height:1.55;">
          <li style="margin-bottom:6px;">The green tick appears when you watch <strong>at least 50% continuously</strong> without skipping. If it doesn’t appear automatically, tap <strong>“Mark as Completed”</strong> after watching (on PC/Laptop: <strong>“Complete and Continue”</strong> at the top right).</li>
          <li style="margin-bottom:6px;"><strong>Important:</strong> The green tick is for your progress tracking only — it does <strong>not</strong> control attendance. Attendance is recorded from your <strong>watch time</strong>, with or without the green tick.</li>
        </ul>
        <div style="font-size:13px;font-weight:700;color:#b45309;margin:12px 0 8px;">🎥 Live Zoom sessions</div>
        <ul style="margin:0;padding:0 0 0 18px;font-size:12px;color:#334155;line-height:1.55;">
          <li style="margin-bottom:6px;">Joining a live class from the app opens <strong>Zoom externally</strong> — that alone does not update your dashboard %.</li>
          <li style="margin-bottom:0;">After every live session, you must submit the <strong>separate live-session attendance form</strong>. If you attended but your % didn’t increase, the form was likely not submitted.</li>
        </ul>
        <p style="margin:12px 0 0;font-size:12px;color:#64748b;">Watch recordings on the VigyanShaala app: <a href="${url}" style="color:#2563eb;font-weight:600;">${url}</a></p>
      </td></tr>
    </table>`;
}

function buildReminderEmailHtml(snapshot: StudentReminderSnapshot, dashboardUrl: string): string {
  const name = escapeHtml(snapshot.name);
  const first = escapeHtml(firstName(snapshot.name));
  const cohort = escapeHtml(snapshot.cohortName);
  const url = escapeHtml(dashboardUrl);
  const recordingsUrl = escapeHtml(resolveRecordingsAppUrl());
  const reportDateLabel = escapeHtml(studentWeeklyReportLabel());
  const attColor = attendanceBarColor(snapshot.attendancePct);
  const attWidth = Math.max(4, Math.min(100, snapshot.attendancePct));

  const statChips: string[] = [];
  if (snapshot.reasons.includes('attendance')) {
    statChips.push(
      `<td style="padding:4px 6px;"><span style="display:inline-block;background:#eff6ff;color:#1d4ed8;font-size:12px;font-weight:600;padding:6px 12px;border-radius:999px;">📊 ${snapshot.attendancePct.toFixed(0)}% attendance</span></td>`,
    );
  }
  if (snapshot.reasons.includes('assignment')) {
    statChips.push(
      `<td style="padding:4px 6px;"><span style="display:inline-block;background:#fffbeb;color:#b45309;font-size:12px;font-weight:600;padding:6px 12px;border-radius:999px;">📝 ${snapshot.assignmentPct}% assignments</span></td>`,
    );
  }
  if (snapshot.reasons.includes('quiz')) {
    statChips.push(
      `<td style="padding:4px 6px;"><span style="display:inline-block;background:#f5f3ff;color:#6d28d9;font-size:12px;font-weight:600;padding:6px 12px;border-radius:999px;">🎯 ${snapshot.avgQuiz}% quiz avg</span></td>`,
    );
  }

  let sections = '';

  if (snapshot.reasons.includes('attendance')) {
    const liveMissed = snapshot.missedSessions.filter(s => s.kind === 'live');
    const preMissed = snapshot.missedSessions.filter(s => s.kind === 'prerecorded');
    let sessionRows = '';
    for (const session of liveMissed) {
      sessionRows += `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#334155;">🎥 ${escapeHtml(session.name)}</td></tr>`;
    }
    for (const session of preMissed) {
      sessionRows += `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#334155;">▶️ ${escapeHtml(session.name)}</td></tr>`;
    }
    if (!sessionRows) {
      sessionRows = `<tr><td style="padding:12px;font-size:13px;color:#64748b;">Open your dashboard to see sessions you still need to watch.</td></tr>`;
    }
    sections += `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
      <tr><td style="padding:16px 18px 10px;border-left:4px solid #2563eb;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:top;">
            <div style="font-size:11px;font-weight:700;color:#2563eb;text-transform:uppercase;letter-spacing:0.06em;">Attendance</div>
            <div style="font-size:22px;font-weight:700;color:#0f172a;margin-top:4px;">${snapshot.attendancePct.toFixed(1)}% <span style="font-size:13px;font-weight:500;color:#64748b;">/ 70% goal</span></div>
          </td>
          <td style="vertical-align:top;text-align:right;width:160px;">
            <a href="${recordingsUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;font-size:11px;font-weight:700;text-decoration:none;padding:10px 12px;border-radius:8px;line-height:1.35;text-align:center;">Watch Recordings on VigyanShaala App</a>
          </td>
        </tr></table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;"><tr>
          <td style="background:#e2e8f0;border-radius:999px;height:8px;padding:0;">
            <div style="width:${attWidth}%;max-width:100%;background:${attColor};height:8px;border-radius:999px;"></div>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:0 18px 14px;">
        <div style="font-size:12px;font-weight:600;color:#475569;margin:10px 0 6px;">Sessions to catch up on</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;">${sessionRows}</table>
        ${attendanceGuideHtml(resolveRecordingsAppUrl())}
      </td></tr>
    </table>`;
  }

  if (snapshot.reasons.includes('assignment')) {
    let assignRows = '';
    for (const item of snapshot.pendingAssignments) {
      const badge = item.status === 'rejected'
        ? '<span style="font-size:10px;font-weight:700;color:#b91c1c;background:#fef2f2;padding:3px 8px;border-radius:6px;">Rejected — re-submit</span>'
        : '<span style="font-size:10px;font-weight:700;color:#b45309;background:#fffbeb;padding:3px 8px;border-radius:6px;">No submission</span>';
      const hint = item.status === 'rejected'
        ? 'Implement feedback, then re-submit'
        : 'Please submit your assignment';
      assignRows += `<tr><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">
        <div style="font-size:14px;font-weight:600;color:#0f172a;">${escapeHtml(item.name)}</div>
        <div style="margin-top:4px;">${badge} <span style="font-size:12px;color:#64748b;margin-left:6px;">${hint}</span></div>
      </td></tr>`;
    }
    sections += `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;">
      <tr><td style="padding:16px 18px 8px;border-left:4px solid #d97706;">
        <div style="font-size:11px;font-weight:700;color:#d97706;text-transform:uppercase;letter-spacing:0.06em;">Assignments</div>
        <div style="font-size:14px;color:#64748b;margin-top:4px;">${snapshot.pendingAssignments.length} item(s) need your action</div>
      </td></tr>
      <tr><td style="padding:0 18px 14px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${assignRows}</table></td></tr>
    </table>`;
  }

  if (snapshot.reasons.includes('quiz')) {
    let quizRows = '';
    for (const quiz of snapshot.pendingQuizzes) {
      const badge = quiz.kind === 'not_attempted'
        ? '<span style="font-size:10px;font-weight:700;color:#6d28d9;background:#f5f3ff;padding:3px 8px;border-radius:6px;">Not attempted</span>'
        : `<span style="font-size:10px;font-weight:700;color:#b45309;background:#fffbeb;padding:3px 8px;border-radius:6px;">${quiz.score}% — re-attempt</span>`;
      const hint = quiz.kind === 'not_attempted' ? 'Attempt this quiz' : 'Aim for 90%+ (best of 3 counts)';
      quizRows += `<tr><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">
        <div style="font-size:14px;font-weight:600;color:#0f172a;">${escapeHtml(quiz.name)}</div>
        <div style="margin-top:4px;">${badge} <span style="font-size:12px;color:#64748b;margin-left:6px;">${hint}</span></div>
      </td></tr>`;
    }
    sections += `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;">
      <tr><td style="padding:16px 18px 8px;border-left:4px solid #7c3aed;">
        <div style="font-size:11px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.06em;">Quizzes</div>
        <div style="font-size:12px;color:#64748b;margin-top:4px;">Up to 3 attempts each — best score is finalized on your dashboard</div>
      </td></tr>
      <tr><td style="padding:0 18px 14px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${quizRows}</table></td></tr>
    </table>`;
  }

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
  <tr><td style="background:linear-gradient(135deg,#5b21b6 0%,#0d9488 100%);border-radius:16px 16px 0 0;padding:28px 24px;text-align:center;">
    <div style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.85);letter-spacing:0.08em;text-transform:uppercase;">She for STEM · Weekly Report · ${reportDateLabel}</div>
    <div style="font-size:26px;font-weight:800;color:#ffffff;margin-top:8px;line-height:1.2;">Hi ${first}! 👋</div>
    <div style="font-size:14px;color:rgba(255,255,255,0.9);margin-top:8px;line-height:1.5;">Your weekly progress report for <strong>${cohort}</strong></div>
  </td></tr>
  <tr><td style="background:#ffffff;padding:20px 24px 8px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
    <p style="margin:0 0 14px;font-size:15px;color:#334155;line-height:1.6;">A few items still need your attention — completing them will boost your dashboard score. You’ve got this! 💪</p>
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>${statChips.join('')}</tr></table>
  </td></tr>
  <tr><td style="background:#ffffff;padding:8px 24px 20px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
    ${sections}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;">
      <tr><td align="center" style="padding:8px 0 20px;">
        <a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#059669,#0d9488);color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:999px;box-shadow:0 4px 14px rgba(5,150,105,0.35);">Open My Dashboard →</a>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="background:#f8fafc;border-radius:0 0 16px 16px;padding:18px 24px;text-align:center;border:1px solid #e2e8f0;border-top:none;">
    <div style="font-size:12px;color:#64748b;line-height:1.6;">Questions? Reply to this email or contact your program coordinator.<br><strong style="color:#475569;">— VigyanShaala She for STEM team</strong></div>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export function buildReminderEmail(snapshot: StudentReminderSnapshot, dashboardUrl: string) {
  const subject = `${firstName(snapshot.name)}, your She for STEM weekly report`;
  const lines: string[] = [`Hi ${snapshot.name},`, '', 'Please complete the following pending items:', ''];
  let section = 1;

  if (snapshot.reasons.includes('attendance')) {
    lines.push(`${section}. Attendance — currently ${snapshot.attendancePct.toFixed(1)}% (target: 70% or higher)`);
    lines.push(`   Watch recordings on VigyanShaala App: ${resolveRecordingsAppUrl()}`);
    if (snapshot.missedSessions.length) {
      const liveMissed = snapshot.missedSessions.filter(s => s.kind === 'live');
      const preMissed = snapshot.missedSessions.filter(s => s.kind === 'prerecorded');
      if (liveMissed.length) {
        lines.push('   Sessions to catch up on (live):');
        for (const session of liveMissed) lines.push(`   • ${session.name}`);
      }
      if (preMissed.length) {
        lines.push('   Pre-recorded videos to watch:');
        for (const session of preMissed) lines.push(`   • ${session.name}`);
      }
    }
    lines.push('');
    lines.push('   Green tick tips:');
    lines.push('   • Watch 50%+ continuously without skipping, or tap Mark as Completed (PC: Complete and Continue).');
    lines.push('   • Green tick is for progress tracking only — attendance uses watch time, not the tick.');
    lines.push('   Live Zoom: submit the live-session attendance form after class — joining Zoom alone does not update your %.');
    lines.push('');
    section++;
  }

  if (snapshot.reasons.includes('assignment')) {
    lines.push(`${section}. Assignments — pending items:`);
    for (const item of snapshot.pendingAssignments) {
      lines.push(`   • ${assignmentReminderLine(item)}`);
    }
    lines.push('');
    section++;
  }

  if (snapshot.reasons.includes('quiz')) {
    lines.push(`${section}. Quizzes — pending items (target: 90% or higher):`);
    for (const quiz of snapshot.pendingQuizzes) {
      lines.push(`   • ${quizReminderLine(quiz)}`);
    }
    lines.push('');
  }

  lines.push(`Open your dashboard: ${dashboardUrl}`, '', 'You’ve got this! — VigyanShaala She for STEM team');
  const text = lines.join('\n');
  const html = buildReminderEmailHtml(snapshot, dashboardUrl);
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

/** Readable date for students — never show internal W27-style week keys in email. */
export function studentWeeklyReportLabel(date = new Date()): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}
