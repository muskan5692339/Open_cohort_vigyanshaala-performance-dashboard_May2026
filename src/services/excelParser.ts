import type {
  ParsedStudent,
  ParsedAttendance,
  ParsedAssignment,
  ParsedQuiz,
  SyncError,
} from '../types/syncTypes';
import type { DiscoveredColumn } from '../types/dynamicSchema';
import {
  inferBusinessRole,
  inferColumnType,
  inferDisplayGroup,
} from './schemaInference';
import { readClassWiseAttendanceFromWorkbook } from './classWiseAttendance';
import type { ClassWiseAttendanceEntry } from './classWiseAttendance';

/* ── helpers ──────────────────────────────────────────── */

function col(headers: string[], ...candidates: string[]): number {
  const lower = headers.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim());
  for (const c of candidates) {
    const needle = c.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
    const i = lower.indexOf(needle);
    if (i !== -1) return i;
    // partial match
    const j = lower.findIndex(h => h.includes(needle) || needle.includes(h));
    if (j !== -1) return j;
  }
  return -1;
}

/** Prefer columns that look like a percentage, not "classes attended" counts. */
function findAttendancePctColumn(headers: string[]): number {
  const normalized = headers.map(h => h.toLowerCase().replace(/[^a-z0-9%]/g, ' ').trim());
  const scored = normalized.map((h, idx) => {
    let score = 0;
    if (h.includes('attendance') || h.includes('attend')) score += 2;
    if (h.includes('%') || h.includes('percent') || h.includes('pct') || h.includes('percentage')) score += 5;
    if (h.includes('overall') || h.includes('session') || h.includes('average') || h.includes('avg')) score += 1;
    if (h.includes('class') && h.includes('no')) score -= 4;
    if (h.includes('classes attended') || h === 'no of classes') score -= 5;
    return { idx, score };
  });
  const best = scored.filter(s => s.score >= 5).sort((a, b) => b.score - a.score)[0];
  if (best) return best.idx;
  return col(headers, 'attendance %', 'attendance percent', 'attendance percentage', 'percent attendance');
}

/** Parse attendance % from Excel cell (75, "75%", 0.75, "18/20"). */
function parseAttendancePercent(raw: string, classesAttended?: string, totalClasses?: string): number {
  const s = (raw ?? '').replace(/,/g, '').trim();
  if (s) {
    const ratio = s.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
    if (ratio) {
      const num = parseFloat(ratio[1]);
      const den = parseFloat(ratio[2]);
      if (den > 0) return Math.min(100, Math.round((num / den) * 100));
    }
    const num = parseFloat(s.replace('%', ''));
    if (!isNaN(num)) {
      if (num > 0 && num <= 1) return Math.round(num * 100);
      return Math.min(100, Math.round(num));
    }
  }
  const attended = parseInt((classesAttended ?? '').replace(/,/g, ''), 10);
  const total = parseInt((totalClasses ?? '').replace(/,/g, ''), 10);
  if (attended > 0 && total > 0) return Math.min(100, Math.round((attended / total) * 100));
  if (attended > 0 && attended <= 100) return attended;
  return 0;
}

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseDate(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();

  // Excel serial number (days since 1900-01-00, with Lotus 1-2-3 leap-year bug offset)
  const n = Number(trimmed);
  if (!isNaN(n) && n > 1000) {
    // Multiply by ms-per-day to get UTC epoch; use local date parts to avoid tz shift
    const d = new Date((n - 25569) * 86_400_000);
    if (!isNaN(d.getTime())) return toYMD(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  // dd/mm/yyyy or dd-mm-yyyy
  const dmy = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    const d = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
    if (!isNaN(d.getTime())) return toYMD(d);
  }

  // yyyy-mm-dd (ISO date-only) — parse as local, not UTC
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return trimmed; // already normalized

  // Fallback: parse as string, then use UTC parts to avoid tz shift
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) return toYMD(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  return null;
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function hashSignature(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) + input.charCodeAt(i);
  }
  return `sig_${(h >>> 0).toString(16)}`;
}

function discoverColumns(headers: string[], rawRows: string[][]): DiscoveredColumn[] {
  return headers.map((name, index) => {
    const samples = rawRows
      .slice(0, 30)
      .map(r => (r[index] ?? '').trim())
      .filter(Boolean)
      .slice(0, 6);
    const typeResult = inferColumnType(name, samples);
    const roleResult = inferBusinessRole(name, samples);
    const groupResult = inferDisplayGroup(name, typeResult.value, roleResult.value);
    return {
      name,
      index,
      sampleValues: samples,
      inferredType: typeResult.value,
      inferredRole: roleResult.value,
      inferredDisplayGroup: groupResult.value,
      typeConfidence: typeResult.confidence,
      roleConfidence: roleResult.confidence,
      displayGroupConfidence: groupResult.confidence,
      mappedType: typeResult.value,
      mappedRole: roleResult.value,
      mappedDisplayGroup: groupResult.value,
    };
  });
}

/* ── Student Master ───────────────────────────────────── */

export function parseStudents(rows: string[][]): { data: ParsedStudent[]; errors: SyncError[] } {
  const errors: SyncError[] = [];
  if (rows.length < 2) {
    return { data: [], errors: [{ message: 'Student Master sheet has no data rows' }] };
  }
  const h = rows[0];
  const c = {
    id:          col(h, 'student id', 'student_id', 'vs id', 'id'),
    name:        col(h, 'name', 'student name', 'full name'),
    email:       col(h, 'email', 'email address', 'e mail', 'e-mail'),
    college:     col(h, 'college', 'institution', 'college name'),
    program:     col(h, 'program', 'programme', 'course', 'program name'),
    cohort:      col(h, 'cohort', 'batch', 'cohort name', 'batch name'),
    state:       col(h, 'state', 'location', 'city'),
    enrolled:    col(h, 'enrollment date', 'enroll date', 'join date', 'enrolled on'),
    status:      col(h, 'status', 'active status', 'student status'),
    certificate: col(h, 'certificate status', 'certificate sent', 'cert status', 'certificate', 'cert'),
    attPct:      findAttendancePctColumn(h),
    classAtt:    col(h, 'no. of classes attended', 'classes attended', 'no of classes'),
    progHours:   col(h, 'program hours', 'programme hours', 'total sessions', 'total classes'),
  };

  if (c.email === -1) {
    return { data: [], errors: [{ message: 'Required column "Email" not found in Student Master' }] };
  }

  const data: ParsedStudent[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every(v => !v)) continue;
    const email = (r[c.email] ?? '').toLowerCase().trim();
    if (!isValidEmail(email)) {
      if (email) errors.push({ row: i + 1, field: 'email', value: email, message: `Row ${i + 1}: invalid email "${email}"` });
      continue;
    }
    const attPctRaw = c.attPct !== -1 ? String(r[c.attPct] ?? '').trim() : '';
    const classRaw = c.classAtt !== -1 ? String(r[c.classAtt] ?? '').trim() : '';
    const progRaw = c.progHours !== -1 ? String(r[c.progHours] ?? '').trim() : '';
    const importedAtt = parseAttendancePercent(attPctRaw, classRaw, progRaw);

    data.push({
      student_id:      c.id !== -1 ? r[c.id]?.trim() || `VS-${String(i).padStart(4, '0')}` : `VS-${String(i).padStart(4, '0')}`,
      name:            c.name !== -1 ? r[c.name]?.trim() || 'Unknown' : 'Unknown',
      email,
      college:         c.college !== -1 ? r[c.college]?.trim() || '' : '',
      program:         c.program !== -1 ? r[c.program]?.trim() || '' : '',
      cohort:          c.cohort !== -1 ? r[c.cohort]?.trim() || '' : '',
      state:           c.state !== -1 ? r[c.state]?.trim() || '' : '',
      enrollment_date:    c.enrolled    !== -1 ? parseDate(r[c.enrolled]) ?? undefined : undefined,
      status:             c.status      !== -1 && r[c.status]?.toLowerCase() === 'inactive' ? 'Inactive' : 'Active',
      certificate_status: c.certificate !== -1 ? r[c.certificate]?.trim() || undefined : undefined,
      imported_attendance_pct: importedAtt > 0 ? importedAtt : undefined,
    });
  }
  return { data, errors };
}

/* ── Attendance ───────────────────────────────────────── */

export function parseAttendance(rows: string[][]): { data: ParsedAttendance[]; errors: SyncError[] } {
  const errors: SyncError[] = [];
  if (rows.length < 2) {
    return { data: [], errors: [{ message: 'Attendance sheet has no data rows' }] };
  }
  const h = rows[0];
  const c = {
    email:    col(h, 'email', 'student email', 'e mail'),
    date:     col(h, 'session date', 'date', 'class date', 'session_date'),
    attended: col(h, 'attended', 'present', 'attendance', 'status'),
    duration: col(h, 'duration', 'hours', 'duration hours', 'duration_hours'),
    session:  col(h, 'session name', 'session', 'class', 'topic'),
  };

  if (c.email === -1) {
    return { data: [], errors: [{ message: 'Required column "Email" not found in Attendance sheet' }] };
  }

  const data: ParsedAttendance[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every(v => !v)) continue;

    const email = (r[c.email] ?? '').toLowerCase().trim();
    if (!isValidEmail(email)) { if (email) errors.push({ row: i+1, field:'email', value:email, message:`Row ${i+1}: invalid email` }); continue; }

    const dateRaw = c.date !== -1 ? r[c.date] : '';
    const sessionDate = parseDate(dateRaw);
    if (!sessionDate) {
      errors.push({ row: i + 1, field: 'session_date', value: dateRaw, message: `Row ${i + 1}: invalid date "${dateRaw}"` });
      continue;
    }

    const attRaw = (c.attended !== -1 ? r[c.attended] : 'yes').toLowerCase();
    const attended = ['yes', 'y', '1', 'true', 'present', 'attended'].includes(attRaw);
    const duration = c.duration !== -1 ? parseFloat(r[c.duration]) || 2 : 2;

    data.push({
      student_email: email,
      session_date: sessionDate,
      duration_hours: duration,
      attended,
      session_name: c.session !== -1 ? r[c.session]?.trim() : undefined,
    });
  }
  return { data, errors };
}

/* ── Assignments ──────────────────────────────────────── */

export function parseAssignments(rows: string[][]): { data: ParsedAssignment[]; errors: SyncError[] } {
  const errors: SyncError[] = [];
  if (rows.length < 2) {
    return { data: [], errors: [{ message: 'Assignments sheet has no data rows' }] };
  }
  const h = rows[0];
  const c = {
    email:    col(h, 'email', 'student email', 'e mail'),
    name:     col(h, 'assignment name', 'assignment', 'name', 'title'),
    due:      col(h, 'due date', 'deadline', 'due_date'),
    status:   col(h, 'status', 'submission status', 'submitted'),
    subAt:    col(h, 'submitted at', 'submission date', 'submitted_at', 'date submitted'),
  };

  const data: ParsedAssignment[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every(v => !v)) continue;
    const email = (r[c.email] ?? '').toLowerCase().trim();
    if (!isValidEmail(email)) { if (email) errors.push({ row:i+1, field:'email', value:email, message:`Row ${i+1}: invalid email`}); continue; }

    const statusRaw = (c.status !== -1 ? r[c.status] : '').toLowerCase();
    let status: ParsedAssignment['status'] = 'Pending';
    if (['submitted', 'yes', 'done', 'complete', 'completed'].includes(statusRaw)) status = 'Submitted';
    else if (['late', 'late submission', 'overdue'].includes(statusRaw)) status = 'Late Submission';

    data.push({
      student_email: email,
      assignment_name: c.name !== -1 ? r[c.name]?.trim() || `Assignment ${i}` : `Assignment ${i}`,
      due_date: parseDate(c.due !== -1 ? r[c.due] : '') ?? new Date().toISOString().split('T')[0],
      status,
      submitted_at: c.subAt !== -1 ? parseDate(r[c.subAt]) ?? undefined : undefined,
    });
  }
  return { data, errors };
}

/* ── Quiz ─────────────────────────────────────────────── */

export function parseQuiz(rows: string[][]): { data: ParsedQuiz[]; errors: SyncError[] } {
  const errors: SyncError[] = [];
  if (rows.length < 2) {
    return { data: [], errors: [{ message: 'Quiz sheet has no data rows' }] };
  }
  const h = rows[0];
  const c = {
    email:  col(h, 'email', 'student email', 'e mail'),
    name:   col(h, 'quiz name', 'quiz', 'name', 'title'),
    date:   col(h, 'date', 'quiz date', 'taken date', 'taken_at'),
    score:  col(h, 'score', 'marks', 'obtained', 'obtained marks'),
    total:  col(h, 'total marks', 'total', 'max marks', 'out of', 'maximum'),
    pct:    col(h, 'percentage', 'percent', 'score percent'),
  };

  const data: ParsedQuiz[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every(v => !v)) continue;
    const email = (r[c.email] ?? '').toLowerCase().trim();
    if (!isValidEmail(email)) { if (email) errors.push({ row:i+1, field:'email', value:email, message:`Row ${i+1}: invalid email`}); continue; }

    const score = c.score !== -1 ? parseFloat(r[c.score]) || 0 : 0;
    const total = c.total !== -1 ? parseFloat(r[c.total]) || 100 : 100;
    const pct   = c.pct !== -1 ? parseFloat(r[c.pct]) || Math.round((score / total) * 100) : Math.round((score / total) * 100);

    data.push({
      student_email: email,
      quiz_name:  c.name !== -1 ? r[c.name]?.trim() || `Quiz ${i}` : `Quiz ${i}`,
      quiz_date:  parseDate(c.date !== -1 ? r[c.date] : '') ?? new Date().toISOString().split('T')[0],
      score,
      total_marks: total,
      percentage: Math.min(100, Math.max(0, pct)),
    });
  }
  return { data, errors };
}

/* ── Wide-format parser (Student_Wise_Perf style) ─────── */

function isSubmittedVal(v: string): boolean {
  const s = v.toLowerCase().trim();
  if (!s) return false;
  // Date-like value means "submitted on that date"
  if (/^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/.test(s) || /^\d{4}-\d{2}-\d{2}$/.test(s)) return true;
  // Certificate or pass indicates completion
  if (s.includes('cert') || s.includes('pass') || s.includes('sent')) return true;
  return ['submitted', 'yes', 'y', '1', 'done', 'complete', 'completed', '✓', '✔', 'true', 'submit', 'received', 'ok'].some(
    k => s === k || s.startsWith('submit'),
  );
}

function isLateVal(v: string): boolean {
  const s = v.toLowerCase().trim();
  return s.includes('late') || s.includes('overdue');
}

/** Parse a percentage or score from Excel (handles 0.75, 75, 75%, pass/fail). */
function parsePercentOrScore(raw: string): number {
  const s = (raw ?? '').replace('%', '').trim();
  if (!s) return 0;
  const num = parseFloat(s);
  if (!isNaN(num)) {
    if (num > 0 && num <= 1) return Math.round(num * 100);
    return Math.min(100, Math.round(num));
  }
  if (isSubmittedVal(s) || ['yes', 'y', '1', 'true', 'pass', 'passed'].includes(s.toLowerCase())) return 60;
  return 0;
}

function isWideFormat(headers: string[]): boolean {
  const lower = headers.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ' '));
  const hasAttendance = lower.some(h => h.includes('attendance') || h.includes('attended'));
  const hasAssignment = lower.some(h => h.includes('assignment') || h.includes('career') || h.includes('resume') || h.includes('swot'));
  return hasAttendance && hasAssignment;
}

export function parseWideFormatSheet(
  rows: string[][],
  cohort: string,
  importDate: string,
): {
  students:    { data: ParsedStudent[];    errors: SyncError[] };
  attendance:  { data: ParsedAttendance[]; errors: SyncError[] };
  assignments: { data: ParsedAssignment[]; errors: SyncError[] };
  quiz:        { data: ParsedQuiz[];       errors: SyncError[] };
  columnMapping: Record<string, string>;
} {
  const emptyErr = (msg: string) => ({ data: [], errors: [{ message: msg }] });
  if (rows.length < 2) {
    const e = emptyErr('Sheet has no data rows');
    return { students: e, attendance: e, assignments: e, quiz: e, columnMapping: {} };
  }

  const h = rows[0];

  const c = {
    studentId:   col(h, 'student id', 'student_id', 'vs id', 'id'),
    email:       col(h, 'email', 'email address', 'e-mail', 'e mail'),
    name:        col(h, 'name', 'student name', 'full name'),
    phone:       col(h, 'phone', 'mobile', 'contact'),
    degree:      col(h, 'currently_pursuing_degree', 'pursuing degree', 'degree', 'currently pursuing'),
    subject:     col(h, 'subject area', 'subject', 'stream'),
    college:     col(h, 'name_of_college_university', 'college', 'university', 'institution'),
    partner:     col(h, 'partner organisation', 'partner organization', 'partner'),
    progHours:   col(h, 'program hours', 'programme hours', 'total hours'),
    classAtt:    col(h, 'no. of classes attended', 'classes attended', 'no of classes', 'attended watched', 'no  of classes'),
    attPct:      findAttendancePctColumn(h),
    assignCE:    col(h, 'assignment_career_exploration', 'career exploration', 'career_exploration'),
    assignSWOT:  col(h, 'assignment_swot', 'swot', 'swot analysis'),
    assignCP:    col(h, 'assignment_career_planner', 'career planner', 'career_planner'),
    assignCVB:   col(h, 'assignment_career_vision_board', 'career vision board', 'vision board', 'career_vision_board'),
    assignCV:    col(h, 'assignment_cv_resume', 'cv/resume', 'cv resume', 'resume', 'cv  resume'),
    finalScore:  col(h, 'final score >=60%', 'final score', 'final selection variable', 'final assessment'),
    endline:     col(h, 'endline form', 'endline'),
    status:      col(h, 'current status/action item', 'current status', 'action item', 'status'),
    certificate: col(h, 'certificate status', 'certificate sent', 'cert status', 'certificate', 'certification'),
  };

  // Build mapping for UI display — always include all fields so missing ones are visible
  const columnMapping: Record<string, string> = {};
  const mapCol = (label: string, idx: number) => { columnMapping[label] = idx !== -1 ? (h[idx] ?? '') : '⚠ not found'; };
  mapCol('Student ID',                  c.studentId);
  mapCol('Email',                       c.email);
  mapCol('Name',                        c.name);
  mapCol('College / University',        c.college);
  mapCol('Program / Degree',            c.degree);
  mapCol('Subject Area',                c.subject);
  mapCol('Partner Organisation',        c.partner);
  mapCol('Program Hours',               c.progHours);
  mapCol('Classes Attended',            c.classAtt);
  mapCol('Attendance %',                c.attPct);
  mapCol('Assignment: Career Exploration', c.assignCE);
  mapCol('Assignment: SWOT',            c.assignSWOT);
  mapCol('Assignment: Career Planner',  c.assignCP);
  mapCol('Assignment: Vision Board',    c.assignCVB);
  mapCol('Assignment: CV / Resume',     c.assignCV);
  mapCol('Final Score ≥60%',            c.finalScore);
  mapCol('Endline Form',                c.endline);
  mapCol('Status',                      c.status);
  mapCol('Certificate Status',          c.certificate);

  const students:    ParsedStudent[]    = [];
  const attendance:  ParsedAttendance[] = [];
  const assignments: ParsedAssignment[] = [];
  const quiz:        ParsedQuiz[]       = [];
  const studentErrors: SyncError[]      = [];

  const assignmentCols: [number, string][] = [
    [c.assignCE,   'Career Exploration'],
    [c.assignSWOT, 'SWOT Analysis'],
    [c.assignCP,   'Career Planner'],
    [c.assignCVB,  'Career Vision Board'],
    [c.assignCV,   'CV / Resume'],
  ];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every(v => !v)) continue;

    const email = (c.email !== -1 ? r[c.email] ?? '' : '').toLowerCase().trim();
    if (!isValidEmail(email)) {
      if (email) studentErrors.push({ row: i + 1, field: 'email', value: email, message: `Row ${i + 1}: invalid email "${email}"` });
      continue;
    }

    const studentId  = c.studentId !== -1 ? r[c.studentId]?.trim() || `VS-${String(i).padStart(4, '0')}` : `VS-${String(i).padStart(4, '0')}`;
    const name       = c.name      !== -1 ? r[c.name]?.trim()      || 'Unknown' : 'Unknown';
    const college    = c.college   !== -1 ? r[c.college]?.trim()   || '' : '';
    const program    = c.degree    !== -1 ? r[c.degree]?.trim()    || '' : '';
    const subject    = c.subject   !== -1 ? r[c.subject]?.trim()   || '' : '';
    const statusRaw  = c.status    !== -1 ? (r[c.status] ?? '').toLowerCase().trim() : '';
    const isInactive = ['dropped', 'inactive', 'left', 'withdrawn', 'exit', 'drop'].some(kw => statusRaw.includes(kw));

    const certRaw = c.certificate !== -1 ? (r[c.certificate] ?? '').trim() : '';

    // Attendance % (computed early for imported_* fields on student)
    // duration_hours=100 is a sentinel so the hook computes: att% = hours_attended/100*100 = attPct
    const attPctRaw  = c.attPct   !== -1 ? String(r[c.attPct]  ?? '').trim() : '';
    const classRaw   = c.classAtt !== -1 ? String(r[c.classAtt] ?? '').trim() : '';
    const progHoursRaw = c.progHours !== -1 ? String(r[c.progHours] ?? '').trim() : '';
    const effectiveAttPct = parseAttendancePercent(attPctRaw, classRaw, progHoursRaw);

    // Assignment completion % from defined assignment columns
    const activeAssignCols = assignmentCols.filter(([idx]) => idx !== -1);
    let submittedAssign = 0;
    for (const [colIdx] of activeAssignCols) {
      const val = (r[colIdx] ?? '').trim();
      if (val && isSubmittedVal(val)) submittedAssign++;
    }
    const importedAssignmentPct =
      activeAssignCols.length > 0
        ? Math.round((submittedAssign / activeAssignCols.length) * 100)
        : undefined;

    let importedQuizPct: number | undefined;
    if (c.finalScore !== -1) {
      const fsRaw = (r[c.finalScore] ?? '').trim();
      if (fsRaw) importedQuizPct = parsePercentOrScore(fsRaw);
    }

    students.push({
      student_id: studentId, name, email,
      college,
      program:            program || subject,
      cohort,
      state:              subject,
      status:             isInactive ? 'Inactive' : 'Active',
      certificate_status: certRaw || undefined,
      imported_attendance_pct: effectiveAttPct,
      imported_assignment_pct: importedAssignmentPct,
      imported_quiz_pct: importedQuizPct,
    });

    attendance.push({
      student_email:  email,
      session_date:   importDate,
      duration_hours: 100,            // sentinel: session represents 100 units
      attended:       effectiveAttPct > 0,
      hours_attended: effectiveAttPct, // actual % (0-100) so hook computes correctly
      session_name:   `${cohort} — ${classRaw || '—'} classes (${effectiveAttPct}%)`,
    });

    // Assignments — one record per defined column (empty → Pending) so denominators match Excel
    for (const [colIdx, aName] of assignmentCols) {
      if (colIdx === -1) continue;
      const val = (r[colIdx] ?? '').trim();
      let status: ParsedAssignment['status'] = 'Pending';
      if (val) {
        if (isSubmittedVal(val)) status = 'Submitted';
        else if (isLateVal(val)) status = 'Late Submission';
      }
      assignments.push({ student_email: email, assignment_name: aName, due_date: importDate, status });
    }

    // Quiz — numeric score when possible, else pass/fail fallback
    if (c.finalScore !== -1) {
      const fsRaw = (r[c.finalScore] ?? '').trim();
      if (fsRaw) {
        const pct = parsePercentOrScore(fsRaw);
        quiz.push({
          student_email: email,
          quiz_name: 'Final Assessment',
          quiz_date: importDate,
          score: pct,
          total_marks: 100,
          percentage: pct,
        });
      }
    }
  }

  return {
    students:    { data: students,    errors: studentErrors },
    attendance:  { data: attendance,  errors: [] },
    assignments: { data: assignments, errors: [] },
    quiz:        { data: quiz,        errors: [] },
    columnMapping,
  };
}

/* ── ExcelJS manual upload ────────────────────────────── */

export async function parseUploadedFile(
  file: File,
  sheetNames: { students: string; attendance: string; assignments: string; quiz: string },
  cohort = 'Incubator 11.0',
): Promise<{
  students:    { data: ParsedStudent[];    errors: SyncError[] };
  attendance:  { data: ParsedAttendance[]; errors: SyncError[] };
  assignments: { data: ParsedAssignment[]; errors: SyncError[] };
  quiz:        { data: ParsedQuiz[];       errors: SyncError[] };
  _sheetsFound:  string[];
  _sheetMapping: Record<string, string>;
  columnMapping: Record<string, string>;
  headers: string[];
  rawRows: Record<string, string>[];
  discoveredColumns: DiscoveredColumn[];
  fileSignature: string;
  classWiseAttendance?: ClassWiseAttendanceEntry[];
  classWiseAttendanceColumns?: string[];
}> {
  const ExcelJS = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());

  const classWiseData = readClassWiseAttendanceFromWorkbook(wb);
  const classWiseExtras = {
    classWiseAttendance: classWiseData?.entries ?? [],
    classWiseAttendanceColumns: classWiseData?.sessionColumns ?? [],
  };

  const actualNames = wb.worksheets.map(ws => ws.name);
  // Use local calendar date (not UTC) so IST/other timezones don't shift the date
  const _now = new Date();
  const importDate = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`;

  const readSheet = (name: string): string[][] => {
    const ws = wb.getWorksheet(name);
    if (!ws) return [];
    const out: string[][] = [];
    ws.eachRow(row => {
      out.push(
        (row.values as (unknown | undefined)[]).slice(1)
          .map(v => {
            if (v === null || v === undefined) return '';
            // ExcelJS returns date cells as Date objects — convert to yyyy-mm-dd so
            // isSubmittedVal and parseDate can recognise them
            if (v instanceof Date) {
              const year  = v.getUTCFullYear();
              const month = String(v.getUTCMonth() + 1).padStart(2, '0');
              const day   = String(v.getUTCDate()).padStart(2, '0');
              return `${year}-${month}-${day}`;
            }
            if (typeof v === 'object') {
              const cell = v as { text?: unknown; hyperlink?: string; richText?: { text: string }[] };
              if (typeof cell.text === 'string' && cell.text.trim()) return cell.text.trim();
              if (typeof cell.hyperlink === 'string') {
                const link = cell.hyperlink.replace(/^mailto:/i, '').trim();
                if (link) return link;
              }
              if (cell.richText)
                return (cell.richText ?? []).map(r => r.text).join('').trim();
            }
            return String(v).trim();
          }),
      );
    });
    return out;
  };

  // Try to find a wide-format performance sheet by scanning content of every sheet
  const norm = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, '');
  // Priority: sheets whose name suggests wide-format; then all others
  const priorityNames = actualNames.filter(n =>
    norm(n).includes('studentwise') || norm(n).includes('perf') || norm(n).includes('monitoring') ||
    norm(n).includes('summary') || norm(n).includes('data') || norm(n).includes('student'),
  );
  const sheetsToScan = [...priorityNames, ...actualNames.filter(n => !priorityNames.includes(n))];

  for (const sheetName of sheetsToScan) {
    const rows = readSheet(sheetName);
    if (rows.length > 1 && isWideFormat(rows[0])) {
      const parsed = parseWideFormatSheet(rows, cohort, importDate);
      const headers = rows[0] ?? [];
      const bodyRows = rows.slice(1);
      const discoveredColumns = discoverColumns(headers, bodyRows);
      const rawRows = bodyRows.map(r =>
        Object.fromEntries(headers.map((h, i) => [h || `col_${i + 1}`, r[i] ?? ''])),
      );
      const fileSignature = hashSignature(`${sheetName}|${headers.join('|')}`);
      return {
        ...parsed,
        _sheetsFound:  actualNames,
        _sheetMapping: { students: sheetName, attendance: sheetName, assignments: sheetName, quiz: sheetName },
        headers,
        rawRows,
        discoveredColumns,
        fileSignature,
        ...classWiseExtras,
      };
    }
  }

  // Fallback: look for separate named sheets
  const findSheet = (desired: string, keywords: string[]) => {
    const exact = actualNames.find(n => norm(n) === norm(desired));
    if (exact) return exact;
    const partial = actualNames.find(n => norm(n).includes(norm(desired)) || norm(desired).includes(norm(n)));
    if (partial) return partial;
    for (const kw of keywords) {
      const kMatch = actualNames.find(n => norm(n).includes(norm(kw)));
      if (kMatch) return kMatch;
    }
    return undefined;
  };

  const rs = findSheet(sheetNames.students,    ['student', 'master', 'roster']);
  const ra = findSheet(sheetNames.attendance,  ['attend']);
  const rx = findSheet(sheetNames.assignments, ['assign']);
  const rq = findSheet(sheetNames.quiz,        ['quiz', 'test', 'exam']);

  const missingErr = (wanted: string): SyncError[] => [{
    message: `Sheet "${wanted}" not found. Available sheets: ${actualNames.join(', ')}`,
  }];

  const studentRows = rs ? readSheet(rs) : [];
  const headers = studentRows[0] ?? [];
  const bodyRows = studentRows.slice(1);
  const discoveredColumns = discoverColumns(headers, bodyRows);
  const rawRows = bodyRows.map(r =>
    Object.fromEntries(headers.map((h, i) => [h || `col_${i + 1}`, r[i] ?? ''])),
  );
  const fileSignature = hashSignature(`${actualNames.join('|')}|${headers.join('|')}`);

  return {
    students:    rs ? parseStudents(studentRows)       : { data: [], errors: missingErr(sheetNames.students) },
    attendance:  ra ? parseAttendance(readSheet(ra))   : { data: [], errors: missingErr(sheetNames.attendance) },
    assignments: rx ? parseAssignments(readSheet(rx))  : { data: [], errors: missingErr(sheetNames.assignments) },
    quiz:        rq ? parseQuiz(readSheet(rq))         : { data: [], errors: missingErr(sheetNames.quiz) },
    _sheetsFound:  actualNames,
    _sheetMapping: { students: rs ?? '(not found)', attendance: ra ?? '(not found)', assignments: rx ?? '(not found)', quiz: rq ?? '(not found)' },
    columnMapping: {},
    headers,
    rawRows,
    discoveredColumns,
    fileSignature,
    ...classWiseExtras,
  };
}
