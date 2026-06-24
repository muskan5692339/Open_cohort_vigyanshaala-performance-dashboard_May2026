import { normalizeStudentEmail } from './studentEmailLookup';
import type { ParsedExcelPayload } from './loadMetricsFromParsedExcel';

export interface ClassWiseSession {
  key: string;
  hours: number;
}

export interface ClassWiseAttendanceEntry {
  student_email: string;
  student_name?: string;
  sessions: ClassWiseSession[];
}

export interface ClassWiseAttendanceData {
  sheetName: string;
  sessionColumns: string[];
  entries: ClassWiseAttendanceEntry[];
}

/** Collapse spaces/dashes (ASCII + Unicode) for fuzzy sheet-name matching. */
export function normalizeSheetName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[\s\u2010-\u2015\u2212_-]+/g, '')
    .replace(/[^\w]/g, '');
}

function normalizeExcelCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v).trim();
  if (typeof v === 'object' && v) {
    const cell = v as Record<string, unknown>;
    if (typeof cell.text === 'string') return cell.text.trim();
    if (typeof cell.hyperlink === 'string') {
      const link = cell.hyperlink.replace(/^mailto:/i, '').trim();
      if (link) return link;
    }
    if (typeof cell.result === 'string' || typeof cell.result === 'number') return String(cell.result).trim();
    if (Array.isArray(cell.richText)) {
      return (cell.richText as Array<{ text?: unknown }>).map(p => String(p?.text ?? '')).join('').trim();
    }
  }
  return String(v).trim();
}

function readSheetRows(ws: { eachRow: (cb: (row: { values: unknown }) => void) => void }): string[][] {
  const out: string[][] = [];
  ws.eachRow(row => {
    out.push((row.values as unknown[]).slice(1).map(v => normalizeExcelCell(v)));
  });
  return out;
}

function normalizeHeader(h: string): string {
  return (h ?? '').replace(/^\uFEFF/, '').trim().toLowerCase();
}

export function isSessionColumnHeader(header: string): boolean {
  const h = (header ?? '').replace(/^\uFEFF/, '').trim();
  if (!h) return false;
  if (/^WK\d/i.test(h)) return true;
  if (/^W\d{1,2}[_\s]/i.test(h)) return true;
  if (/^week\s*\d/i.test(h)) return true;
  if (/^session\s*\d/i.test(h)) return true;
  return false;
}

export function findClassWiseAttendanceSheetName(sheetNames: string[]): string | undefined {
  const scored = sheetNames.map(name => {
    const norm = normalizeSheetName(name);
    let score = 0;
    if (norm === 'classwiseattendance') score += 100;
    if (norm.includes('classwise') && norm.includes('attendance')) score += 80;
    if (norm.includes('class') && norm.includes('attendance')) score += 50;
    if (norm.includes('session') && norm.includes('attendance')) score += 30;
    return { name, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.find(s => s.score >= 50)?.name;
}

function isEmailHeader(header: string): boolean {
  const l = normalizeHeader(header);
  return l === 'email' || l === 'e mail' || l === 'e-mail' || l.endsWith(' email') || l.includes('email');
}

function findHeaderRowIndex(rows: string[][]): number {
  const limit = Math.min(rows.length, 12);
  let bestIdx = 0;
  let bestScore = -1;

  for (let i = 0; i < limit; i++) {
    const headers = rows[i] ?? [];
    const emailIdx = headers.findIndex(isEmailHeader);
    const sessionCount = headers.filter(isSessionColumnHeader).length;
    let score = 0;
    if (emailIdx >= 0) score += 10;
    score += sessionCount * 3;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestScore > 0 ? bestIdx : 0;
}

export function isClassWiseAttendanceHeaders(headers: string[]): boolean {
  if (!headers.length) return false;
  const hasEmail = headers.some(isEmailHeader);
  const sessionCols = headers.filter(isSessionColumnHeader);
  return hasEmail && sessionCols.length >= 1;
}

function parseSessionHours(raw: string): number {
  const n = parseFloat(String(raw ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function normalizeEmail(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^mailto:/i, '')
    .trim();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function parseClassWiseAttendanceRows(
  rows: string[][],
  sheetName = '',
): ClassWiseAttendanceData | null {
  if (rows.length < 2) return null;

  const headerRowIdx = findHeaderRowIndex(rows);
  const headers = (rows[headerRowIdx] ?? []).map(h => (h ?? '').replace(/^\uFEFF/, '').trim());
  const nameMatchesClassWise =
    !!sheetName && !!findClassWiseAttendanceSheetName([sheetName]);

  if (!isClassWiseAttendanceHeaders(headers) && !nameMatchesClassWise) return null;

  const emailIdx = headers.findIndex(isEmailHeader);
  if (emailIdx < 0) return null;

  const nameCol = headers.findIndex(h => {
    const l = normalizeHeader(h);
    return l === 'full name' || l === 'name' || l === 'student name';
  });

  let sessionColumns = headers.filter(isSessionColumnHeader);
  if (!sessionColumns.length && nameMatchesClassWise) {
    sessionColumns = headers.filter((h, idx) => idx !== emailIdx && idx !== nameCol && h.trim());
  }
  if (!sessionColumns.length) return null;

  const entries: ClassWiseAttendanceEntry[] = [];
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every(v => !v)) continue;

    const email = normalizeEmail(r[emailIdx] ?? '');
    if (!isValidEmail(email)) continue;

    const sessions: ClassWiseSession[] = sessionColumns.map(col => {
      const colIdx = headers.indexOf(col);
      return { key: col, hours: parseSessionHours(r[colIdx] ?? '') };
    });

    entries.push({
      student_email: email,
      student_name: nameCol >= 0 ? (r[nameCol] ?? '').trim() || undefined : undefined,
      sessions,
    });
  }

  if (!entries.length) return null;
  return { sheetName: sheetName || 'Class-wise Attendance', sessionColumns, entries };
}

export function readClassWiseAttendanceFromWorkbook(
  wb: { worksheets: { name: string }[]; getWorksheet: (name: string) => { eachRow: (cb: (row: { values: unknown }) => void) => void } | undefined },
): ClassWiseAttendanceData | null {
  const names = wb.worksheets.map(ws => ws.name);
  const preferred = findClassWiseAttendanceSheetName(names);
  const sheetsToTry = preferred
    ? [preferred, ...names.filter(n => n !== preferred)]
    : names.filter(n => normalizeSheetName(n).includes('attendance'));

  for (const sheetName of sheetsToTry) {
    const ws = wb.getWorksheet(sheetName);
    if (!ws) continue;
    const rows = readSheetRows(ws);
    const parsed = parseClassWiseAttendanceRows(rows, sheetName);
    if (parsed) {
      if (import.meta.env.DEV) {
        console.debug(
          '[ClassWiseAttendance] loaded',
          parsed.entries.length,
          'students from sheet',
          `"${parsed.sheetName}"`,
          `(${parsed.sessionColumns.length} sessions)`,
        );
      }
      return parsed;
    }
  }

  if (import.meta.env.DEV) {
    console.warn('[ClassWiseAttendance] no matching sheet found. Sheets:', names);
  }
  return null;
}

export async function loadClassWiseAttendanceFromFile(file: File): Promise<ClassWiseAttendanceData | null> {
  const ExcelJS = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  return readClassWiseAttendanceFromWorkbook(wb);
}

export function getClassWiseAttendanceForStudent(
  payload: ParsedExcelPayload | null | undefined,
  email: string,
): ClassWiseAttendanceEntry | undefined {
  if (!payload?.classWiseAttendance?.length) return undefined;
  const key = normalizeStudentEmail(email);
  return payload.classWiseAttendance.find(e => normalizeStudentEmail(e.student_email) === key);
}

export function buildSessionTrendFromClassWise(
  entry: ClassWiseAttendanceEntry,
): { name: string; value: number }[] {
  return entry.sessions.map(s => ({
    name: s.key,
    value: Math.round(s.hours * 100) / 100,
  }));
}

export function countAttendedSessions(entry: ClassWiseAttendanceEntry): number {
  return entry.sessions.filter(s => s.hours > 0).length;
}

export function countMissedSessions(entry: ClassWiseAttendanceEntry): number {
  return entry.sessions.filter(s => s.hours <= 0).length;
}

export function totalSessionHours(entry: ClassWiseAttendanceEntry): number {
  return Math.round(entry.sessions.reduce((sum, s) => sum + s.hours, 0) * 100) / 100;
}

export function parseProgramHours(raw: string): number | null {
  const text = (raw ?? '').replace(/,/g, '').trim();
  if (!text || text === '—') return null;
  const n = parseFloat(text);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Attendance % = sum(session hours) / total program hours × 100 */
export function computeHoursBasedAttendance(
  entry: ClassWiseAttendanceEntry,
  totalProgramHours: number | null,
): {
  attendedHours: number;
  totalHours: number;
  missedHours: number;
  attendedPct: number;
  missedPct: number;
} {
  const attendedHours = totalSessionHours(entry);
  // Total program hours: master-sheet value, or number of class-wise session columns (e.g. 5 slots).
  const totalHours =
    totalProgramHours && totalProgramHours > 0
      ? totalProgramHours
      : entry.sessions.length > 0
        ? entry.sessions.length
        : attendedHours;
  const missedHours = Math.max(0, Math.round((totalHours - attendedHours) * 100) / 100);
  const attendedPct =
    totalHours > 0 ? Math.round((attendedHours / totalHours) * 10000) / 100 : 0;
  const missedPct = Math.max(0, Math.round((100 - attendedPct) * 100) / 100);
  return { attendedHours, totalHours, missedHours, attendedPct, missedPct };
}

export function buildAttendanceDonutFromHours(
  attendedPct: number,
  missedPct: number,
): { name: string; value: number }[] {
  return [
    { name: 'Attended', value: attendedPct },
    { name: 'Missed', value: missedPct },
  ];
}

/** @deprecated Use computeHoursBasedAttendance — kept for session-count fallback */
export function attendancePctFromClassWise(entry: ClassWiseAttendanceEntry): number {
  const total = entry.sessions.length;
  if (!total) return 0;
  return Math.round((countAttendedSessions(entry) / total) * 100);
}
