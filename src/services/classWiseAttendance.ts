import { normalizeStudentEmail } from './studentEmailLookup';
import type { ParsedExcelPayload } from './loadMetricsFromParsedExcel';
import { readExcelRow, type ExcelReadableRow } from './excelCellValue';

export interface ClassWiseSession {
  key: string;
  hours: number;
  /** Parsed from header, e.g. "Pre-rec WK3 (7 min)". */
  durationMin?: number | null;
  /** Max program credit when fully watched (= durationMin ÷ 60). */
  maxCreditHours?: number;
}

export type SessionTrendPoint = {
  name: string;
  value: number;
  hoursCredit?: number;
  durationMin?: number | null;
};

export interface ClassWiseAttendanceEntry {
  student_email: string;
  student_name?: string;
  sessions: ClassWiseSession[];
  /** Pre-recorded video watch hours (separate from live session columns). */
  preRecorded?: ClassWiseSession[];
}

export interface ClassWiseAttendanceData {
  sheetName: string;
  sessionColumns: string[];
  preRecordedColumns: string[];
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

function readSheetRows(ws: {
  eachRow: (cb: (row: ExcelReadableRow) => void) => void;
  getRow: (n: number) => ExcelReadableRow;
  columnCount?: number;
  actualColumnCount?: number;
}): string[][] {
  // Daily Attendance often has short row 1 (counts) and real date headers on row 2+.
  // New dates (24-Sep / 25-Sep) sit past early cellCount — scan all rows + sheet width.
  let colCount = Math.max(
    ws.getRow(1).cellCount ?? 0,
    ws.getRow(2).cellCount ?? 0,
    ws.getRow(3).cellCount ?? 0,
    ws.columnCount ?? 0,
    ws.actualColumnCount ?? 0,
    1,
  );
  ws.eachRow(row => {
    colCount = Math.max(colCount, row.cellCount ?? 0);
  });
  const out: string[][] = [];
  ws.eachRow(row => {
    out.push(readExcelRow(row, colCount));
  });
  return out;
}

function normalizeHeader(h: string): string {
  return (h ?? '').replace(/^\uFEFF/, '').trim().toLowerCase();
}

export function isPreRecordedColumnHeader(header: string): boolean {
  const h = normalizeHeader(header);
  if (!h) return false;
  return /pre[-\s]?recorded/.test(h) || /^prerecorded/.test(h);
}

/** Parse video length from header text, e.g. "Pre-recorded WK3 (7 min)" or "Pre-rec WK3 (02:21 min)". */
export function parseDurationFromPreRecordedHeader(header: string): number | null {
  const h = (header ?? '').replace(/^\uFEFF/, '').trim();

  const mmssPatterns = [
    /\(\s*(\d{1,3}):(\d{2})\s*(?:min(?:ute)?s?)?\s*\)/i,
    /\[\s*(\d{1,3}):(\d{2})\s*(?:min(?:ute)?s?)?\s*\]/i,
    /[-–—]\s*(\d{1,3}):(\d{2})\s*(?:min(?:ute)?s?)?\s*$/i,
    /(\d{1,3}):(\d{2})\s*(?:min(?:ute)?s?)?\s*$/i,
  ];
  for (const pattern of mmssPatterns) {
    const match = h.match(pattern);
    if (match) {
      const mins = parseInt(match[1], 10);
      const secs = parseInt(match[2], 10);
      if (Number.isFinite(mins) && Number.isFinite(secs) && secs >= 0 && secs < 60) {
        const total = mins + secs / 60;
        if (total > 0) return Math.round(total * 1000) / 1000;
      }
    }
  }

  const minutePatterns = [
    /\(\s*(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?\s*\)/i,
    /\[\s*(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?\s*\]/i,
    /[-–—]\s*(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?\s*$/i,
    /(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?\s*$/i,
  ];
  for (const pattern of minutePatterns) {
    const match = h.match(pattern);
    if (match) {
      const minutes = parseFloat(match[1]);
      if (Number.isFinite(minutes) && minutes > 0) return minutes;
    }
  }
  return null;
}

export function preRecordedChartLabel(header: string): string {
  return header
    .replace(/^\uFEFF/, '')
    .replace(/\(\s*\d{1,3}:\d{2}\s*(?:min(?:ute)?s?)?\s*\)/gi, '')
    .replace(/\(\s*\d+(?:\.\d+)?\s*m(?:in(?:ute)?s?)?\s*\)/gi, '')
    .replace(/\[\s*\d{1,3}:\d{2}\s*(?:min(?:ute)?s?)?\s*\]/gi, '')
    .replace(/\[\s*\d+(?:\.\d+)?\s*m(?:in(?:ute)?s?)?\s*\]/gi, '')
    .replace(/\s*[-–—]\s*\d{1,3}:\d{2}\s*(?:min(?:ute)?s?)?\s*$/i, '')
    .replace(/\s*[-–—]\s*\d+(?:\.\d+)?\s*m(?:in(?:ute)?s?)?\s*$/i, '')
    .replace(/\s+\d{1,3}:\d{2}\s*(?:min(?:ute)?s?)?\s*$/i, '')
    .replace(/\s+\d+(?:\.\d+)?\s*m(?:in(?:ute)?s?)?\s*$/i, '')
    .trim();
}

function maxCreditHoursForPreRecordedColumn(
  column: string,
  durationMin: number | null,
  entries: ClassWiseAttendanceEntry[],
): number {
  if (durationMin && durationMin > 0) {
    return Math.round((durationMin / 60) * 1000) / 1000;
  }
  const colMax = Math.max(
    0,
    ...entries.map(e => e.preRecorded?.find(s => s.key === column)?.hours ?? 0),
  );
  return colMax > 0 ? Math.round(colMax * 1000) / 1000 : 0;
}

export function preRecordedCompletionPct(hours: number, maxCreditHours: number): number {
  if (!Number.isFinite(maxCreditHours) || maxCreditHours <= 0) return 0;
  return Math.min(100, Math.round((Math.max(0, hours) / maxCreditHours) * 10000) / 100);
}

export function isSessionColumnHeader(header: string): boolean {
  const h = (header ?? '').replace(/^\uFEFF/, '').trim();
  if (!h) return false;
  if (isPreRecordedColumnHeader(h)) return false;
  if (isDateAttendanceHeader(h)) return false;
  if (/^WK\d/i.test(h)) return true;
  // WK_MC_Saturday 18th, WK_WS_..., etc. (track code without a week number)
  if (/^WK_(MC|WS|SUK|PR)/i.test(h)) return true;
  if (/^WS\d*[_\s]/i.test(h)) return true;
  if (/^W\d{1,2}[_\s]/i.test(h)) return true;
  if (/^week\s*\d/i.test(h)) return true;
  if (/^session\s*\d/i.test(h)) return true;
  return false;
}

const MONTH_INDEX: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

/** Excel serial days (approx 2009–2064) — Daily Attendance headers often arrive as these. */
function excelSerialToUtcDate(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial < 40000 || serial > 60000) return null;
  const utc = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
  const d = new Date(utc);
  return Number.isNaN(d.getTime()) ? null : d;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toIsoFromParts(year: number, monthIndex: number, day: number): string | null {
  if (!Number.isFinite(year) || monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, monthIndex, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== monthIndex || d.getUTCDate() !== day) return null;
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

/** Normalize Daily Attendance headers to YYYY-MM-DD when possible. */
export function normalizeAttendanceDateHeader(header: string): string | null {
  const h = (header ?? '').replace(/^\uFEFF/, '').trim();
  if (!h) return null;

  const iso = h.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const slash = h.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    let year = Number(slash[3]);
    if (year < 100) year += 2000;
    // Prefer D/M/Y (India) when day > 12; else assume D/M/Y still for Inc sheets.
    const day = a;
    const month = b;
    return toIsoFromParts(year, month - 1, day);
  }

  const serial = Number(h);
  if (/^\d{5}(\.\d+)?$/.test(h)) {
    const d = excelSerialToUtcDate(serial);
    if (d) return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  }

  // 24-Sep, 24 Sep, 24-Sep-2026, 24 Sep 26
  const dMon = h.match(/^(\d{1,2})[-\s]+([A-Za-z]{3,9})(?:[-\s,]+(\d{2,4}))?$/);
  if (dMon) {
    const day = Number(dMon[1]);
    const month = MONTH_INDEX[dMon[2].toLowerCase()];
    let year = dMon[3] ? Number(dMon[3]) : new Date().getUTCFullYear();
    if (year < 100) year += 2000;
    if (month != null) return toIsoFromParts(year, month, day);
  }

  // Sep-24, Sep 24, Sep 24 2026, September 24, 2026
  const monD = h.match(/^([A-Za-z]{3,9})[-\s]+(\d{1,2})(?:[-\s,]+(\d{2,4}))?$/);
  if (monD) {
    const month = MONTH_INDEX[monD[1].toLowerCase()];
    const day = Number(monD[2]);
    let year = monD[3] ? Number(monD[3]) : new Date().getUTCFullYear();
    if (year < 100) year += 2000;
    if (month != null) return toIsoFromParts(year, month, day);
  }

  return null;
}

/** Date columns on the Daily Attendance sheet (ISO, D/M/Y, 24-Sep, Excel serial). */
export function isDateAttendanceHeader(header: string): boolean {
  return normalizeAttendanceDateHeader(header) != null;
}

export function formatSessionDateLabel(header: string): string {
  const iso = normalizeAttendanceDateHeader(header) ?? header.trim();
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return header.trim();
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function isDailyAttendanceSheetName(name: string): boolean {
  return normalizeSheetName(name) === 'dailyattendance';
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
    const preRecordedCount = headers.filter(isPreRecordedColumnHeader).length;
    const dateCount = headers.filter(isDateAttendanceHeader).length;
    let score = 0;
    if (emailIdx >= 0) score += 10;
    score += sessionCount * 3;
    score += preRecordedCount * 3;
    score += dateCount * 3;
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
  const preRecordedCols = headers.filter(isPreRecordedColumnHeader);
  return hasEmail && (sessionCols.length >= 1 || preRecordedCols.length >= 1);
}

function parseSessionHours(raw: string): number {
  const n = parseFloat(String(raw ?? '').replace(/,/g, '').trim());
  return normalizeSessionHours(n);
}

function parseDailyAttendanceMark(raw: string): number {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s || s === '0' || s === 'absent' || s === 'a' || s === 'n' || s === '#n/a' || s === '#na') return 0;
  if (['1', 'p', 'present', 'yes', 'y', 'true'].includes(s)) return 1;
  const n = parseFloat(s.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? 1 : 0;
}

function parsePreRecordedHours(raw: string): number {
  const n = parseFloat(String(raw ?? '').replace(/,/g, '').trim());
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100) / 100;
}

/** Each session slot counts at most 1 hour; values above 1 are treated as full attendance. */
export function normalizeSessionHours(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  return Math.min(1, hours);
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
  const dateColumns = headers.filter(isDateAttendanceHeader);
  const isDailySheet = isDailyAttendanceSheetName(sheetName) || dateColumns.length >= 3;

  if (!isClassWiseAttendanceHeaders(headers) && !nameMatchesClassWise && !isDailySheet) return null;

  const emailIdx = headers.findIndex(isEmailHeader);
  if (emailIdx < 0) return null;

  const nameCol = headers.findIndex(h => {
    const l = normalizeHeader(h);
    return l === 'full name' || l === 'name' || l === 'student name';
  });

  let sessionColumns = headers.filter(isSessionColumnHeader);
  let preRecordedColumns = headers.filter(isPreRecordedColumnHeader);
  if (isDailySheet && dateColumns.length) {
    sessionColumns = dateColumns;
    preRecordedColumns = [];
  } else if (!sessionColumns.length && !preRecordedColumns.length && nameMatchesClassWise) {
    const dataColumns = headers.filter((h, idx) => idx !== emailIdx && idx !== nameCol && h.trim());
    sessionColumns = dataColumns.filter(h => !isPreRecordedColumnHeader(h));
    preRecordedColumns = dataColumns.filter(isPreRecordedColumnHeader);
  }
  if (!sessionColumns.length && !preRecordedColumns.length) return null;

  const dateLabels = isDailySheet
    ? sessionColumns.map(col => {
      const label = formatSessionDateLabel(col);
      return label;
    })
    : sessionColumns;

  const entries: ClassWiseAttendanceEntry[] = [];
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every(v => !v)) continue;

    const email = normalizeEmail(r[emailIdx] ?? '');
    if (!isValidEmail(email)) continue;

    const sessions: ClassWiseSession[] = sessionColumns.map((col, idx) => {
      const colIdx = headers.indexOf(col);
      const raw = r[colIdx] ?? '';
      return {
        key: isDailySheet ? dateLabels[idx] : col,
        hours: isDailySheet ? parseDailyAttendanceMark(raw) : parseSessionHours(raw),
      };
    });
    const preRecorded: ClassWiseSession[] = preRecordedColumns.map(col => {
      const colIdx = headers.indexOf(col);
      const durationMin = parseDurationFromPreRecordedHeader(col);
      return {
        key: col,
        hours: parsePreRecordedHours(r[colIdx] ?? ''),
        durationMin,
      };
    });

    entries.push({
      student_email: email,
      student_name: nameCol >= 0 ? (r[nameCol] ?? '').trim() || undefined : undefined,
      sessions,
      preRecorded: preRecorded.length ? preRecorded : undefined,
    });
  }

  if (!entries.length) return null;

  for (const entry of entries) {
    if (!entry.preRecorded?.length) continue;
    entry.preRecorded = entry.preRecorded.map(session => {
      const maxCreditHours = maxCreditHoursForPreRecordedColumn(
        session.key,
        session.durationMin ?? null,
        entries,
      );
      return { ...session, maxCreditHours };
    });
  }
  return {
    sheetName: sheetName || 'Class-wise Attendance',
    sessionColumns,
    preRecordedColumns,
    entries,
  };
}

export function readClassWiseAttendanceFromWorkbook(
  wb: {
    worksheets: { name: string }[];
    getWorksheet: (name: string) => {
      eachRow: (cb: (row: ExcelReadableRow) => void) => void;
      getRow: (n: number) => ExcelReadableRow;
      columnCount?: number;
    } | undefined;
  },
): ClassWiseAttendanceData | null {
  const names = wb.worksheets.map(ws => ws.name);
  const classWise = findClassWiseAttendanceSheetName(names);
  const daily = names.find(isDailyAttendanceSheetName);
  // Prefer Daily Attendance when present (Inc 14); fall back to Class-wise.
  // If both parse, keep the sheet with more session/date columns.
  const sheetsToTry = [daily, classWise].filter((name, idx, arr): name is string =>
    Boolean(name) && arr.indexOf(name) === idx,
  );
  if (!sheetsToTry.length) return null;

  let best: ClassWiseAttendanceData | null = null;
  for (const sheetName of sheetsToTry) {
    const ws = wb.getWorksheet(sheetName);
    if (!ws) continue;
    const rows = readSheetRows(ws);
    const parsed = parseClassWiseAttendanceRows(rows, sheetName);
    if (!parsed) continue;
    const score = parsed.sessionColumns.length + (parsed.preRecordedColumns?.length ?? 0);
    const bestScore = best
      ? best.sessionColumns.length + (best.preRecordedColumns?.length ?? 0)
      : -1;
    if (!best || score > bestScore) best = parsed;
  }

  return best;
}

export async function loadClassWiseAttendanceFromFile(
  file: File,
  cachedBuffer?: ArrayBuffer,
): Promise<ClassWiseAttendanceData | null> {
  const { loadWorkbookFromBuffer, readFileAsArrayBuffer } = await import('./workbookBuffer');
  const buffer = cachedBuffer ?? await readFileAsArrayBuffer(file);
  const wb = await loadWorkbookFromBuffer(buffer);
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

export function buildTrendFromSessions(
  sessions: ClassWiseSession[],
): { name: string; value: number }[] {
  return sessions.map(s => ({
    name: s.key,
    value: Math.round(normalizeSessionHours(s.hours) * 100) / 100,
  }));
}

export function buildSessionTrendFromClassWise(
  entry: ClassWiseAttendanceEntry,
): SessionTrendPoint[] {
  return buildTrendFromSessions(entry.sessions);
}

export function buildPreRecordedTrendFromClassWise(
  entry: ClassWiseAttendanceEntry,
): SessionTrendPoint[] {
  return (entry.preRecorded ?? []).map(s => {
    const durationMin = s.durationMin ?? parseDurationFromPreRecordedHeader(s.key);
    const maxCredit =
      s.maxCreditHours && s.maxCreditHours > 0
        ? s.maxCreditHours
        : durationMin && durationMin > 0
          ? Math.round((durationMin / 60) * 1000) / 1000
          : 0;
    return {
      name: preRecordedChartLabel(s.key),
      value: preRecordedCompletionPct(s.hours, maxCredit),
      hoursCredit: s.hours,
      durationMin,
    };
  });
}

/** Red (0) → orange → yellow → light green → green (1) for partial session hours. */
export function sessionHoursIndicatorColor(hours: number): string {
  const h = Math.max(0, Math.min(1, hours));
  if (h >= 1) return '#22c55e';
  const stops: Array<[number, string]> = [
    [0, '#ef4444'],
    [0.25, '#f97316'],
    [0.5, '#eab308'],
    [0.75, '#a8e063'],
    [1, '#22c55e'],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (h >= t0 && h <= t1) {
      const t = t1 === t0 ? 1 : (h - t0) / (t1 - t0);
      return mixHexColors(c0, c1, t);
    }
  }
  return '#ef4444';
}

export function sessionHoursIndicatorFill(hours: number): string {
  const stroke = sessionHoursIndicatorColor(hours);
  const rgb = stroke.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, 0.22)`;
  if (stroke.startsWith('#') && stroke.length === 7) return `${stroke}38`;
  return 'rgba(239, 68, 68, 0.22)';
}

function mixHexColors(a: string, b: string, t: number): string {
  const parse = (hex: string) => {
    const n = hex.replace('#', '');
    return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
  };
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const bl = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

export function countAttendedSessions(entry: ClassWiseAttendanceEntry): number {
  return entry.sessions.filter(s => normalizeSessionHours(s.hours) > 0).length;
}

export function countMissedSessions(entry: ClassWiseAttendanceEntry): number {
  return entry.sessions.filter(s => normalizeSessionHours(s.hours) <= 0).length;
}

export function totalSessionHours(entry: ClassWiseAttendanceEntry): number {
  return Math.round(
    entry.sessions.reduce((sum, s) => sum + normalizeSessionHours(s.hours), 0) * 100,
  ) / 100;
}

/** Max credit hours for all pre-recorded videos (from header duration / 60). */
export function totalPreRecordedCreditHours(entry: ClassWiseAttendanceEntry): number {
  const videos = entry.preRecorded ?? [];
  const sum = videos.reduce((acc, s) => {
    const durationMin = s.durationMin ?? parseDurationFromPreRecordedHeader(s.key);
    const max =
      s.maxCreditHours && s.maxCreditHours > 0
        ? s.maxCreditHours
        : durationMin && durationMin > 0
          ? Math.round((durationMin / 60) * 1000) / 1000
          : 0;
    return acc + max;
  }, 0);
  return Math.round(sum * 1000) / 1000;
}

/** Watched pre-recorded hours, capped at each video's max credit. */
export function attendedPreRecordedHours(entry: ClassWiseAttendanceEntry): number {
  const videos = entry.preRecorded ?? [];
  const sum = videos.reduce((acc, s) => {
    const durationMin = s.durationMin ?? parseDurationFromPreRecordedHeader(s.key);
    const max =
      s.maxCreditHours && s.maxCreditHours > 0
        ? s.maxCreditHours
        : durationMin && durationMin > 0
          ? Math.round((durationMin / 60) * 1000) / 1000
          : 0;
    const watched = Math.max(0, Number(s.hours) || 0);
    return acc + (max > 0 ? Math.min(watched, max) : watched);
  }, 0);
  return Math.round(sum * 1000) / 1000;
}

/** Live (capped at 1/class) + pre-recorded watched hours. */
export function totalAttendedProgramHours(entry: ClassWiseAttendanceEntry): number {
  return Math.round((totalSessionHours(entry) + attendedPreRecordedHours(entry)) * 1000) / 1000;
}

/** Live class slots + pre-recorded video credit hours. */
export function totalProgramHoursFromClassWise(entry: ClassWiseAttendanceEntry): number {
  const live = entry.sessions.length;
  const pre = totalPreRecordedCreditHours(entry);
  return Math.round((live + pre) * 1000) / 1000;
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
  // Prefer explicit session-slot count (each slot = up to 1 hr).
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
