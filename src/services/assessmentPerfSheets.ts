import { excelCellToString, readExcelRow, type ExcelReadableRow } from './excelCellValue';
import { loadWorkbookFromBuffer, readFileAsArrayBuffer } from './workbookBuffer';
import {
  isAssignmentCommentColumn,
  normalizeAssignmentKey,
} from './studentAssignmentDisplay';

function normalizeSheetKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function isAssignmentPerfSheetName(name: string): boolean {
  const n = normalizeSheetKey(name);
  return n === 'assignmentperf' || n === 'assignmentperformance' || n === 'assignment_perf';
}

export function isQuizPerfSheetName(name: string): boolean {
  const n = normalizeSheetKey(name);
  return n === 'quizperf' || n === 'quizperformance' || n === 'quiz_perf';
}

/** Fallback when Quiz_Perf formulas have no cached values. */
export function isQuizSourceSheetName(name: string): boolean {
  const n = normalizeSheetKey(name);
  return n === 'quizsource' || n === 'quiz_source';
}

/** Long-format assignment feedback: email (C), feedback (K), assignment name (R). */
export function isAssignmentSourceSheetName(name: string): boolean {
  const n = normalizeSheetKey(name);
  return n === 'assignmentsource' || n === 'assignment_source';
}

/** Excel 1-based columns C / K / R → 0-based indices. */
const ASSIGNMENT_SOURCE_EMAIL_COL = 2;
const ASSIGNMENT_SOURCE_FEEDBACK_COL = 10;
const ASSIGNMENT_SOURCE_NAME_COL = 17;

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase().replace(/^mailto:/i, '').trim();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function readSheetRows(ws: {
  eachRow: (cb: (row: ExcelReadableRow) => void) => void;
  getRow: (n: number) => ExcelReadableRow;
}, minCols = 1): string[][] {
  const colCount = Math.max(ws.getRow(1).cellCount, ws.getRow(2).cellCount, minCols, 1);
  const out: string[][] = [];
  ws.eachRow(row => {
    out.push(readExcelRow(row, colCount));
  });
  return out;
}

function findEmailCol(headers: string[]): number {
  return headers.findIndex(h => {
    const l = h.toLowerCase().trim();
    return l === 'email' || l === 'e-mail' || l === 'e mail' || l.includes('email');
  });
}

function matchQuizColumnHeader(header: string): string | null {
  const m = header.trim().match(/^quiz\s*(\d+)(?:\s*score)?$/i);
  return m ? `Quiz ${m[1]} Score` : null;
}

/** Merge quiz scores from a sheet into byEmail; returns columns that have at least one value. */
function ingestQuizSheet(
  sheet: { rows: string[][] },
  byEmail: Map<string, Record<string, string>>,
  options?: { onlyFillMissing?: boolean },
): string[] {
  if (sheet.rows.length < 2) return [];
  const headerRow = sheet.rows[0] ?? [];
  const emailIdx = findEmailCol(headerRow);
  if (emailIdx < 0) return [];

  const quizCols: { idx: number; name: string }[] = [];
  headerRow.forEach((h, i) => {
    const name = matchQuizColumnHeader(h);
    if (!name) return;
    quizCols.push({ idx: i, name });
  });
  if (!quizCols.length) return [];

  const quizSeen = new Set<string>();
  for (let r = 1; r < sheet.rows.length; r++) {
    const row = sheet.rows[r];
    if (!row) continue;
    const email = normalizeEmail(row[emailIdx] ?? '');
    if (!isValidEmail(email)) continue;
    const fields = byEmail.get(email) ?? {};
    for (const col of quizCols) {
      const raw = (row[col.idx] ?? '').trim();
      if (!raw) continue;
      if (options?.onlyFillMissing && String(fields[col.name] ?? '').trim()) continue;
      fields[col.name] = raw;
      quizSeen.add(col.name);
    }
    byEmail.set(email, fields);
  }
  return quizCols.filter(c => quizSeen.has(c.name)).map(c => c.name);
}

/** Carry forward merged top-row titles: Career Exploration | (blank) → both get title. */
function fillForwardTitles(titles: string[]): string[] {
  const out = [...titles];
  let last = '';
  for (let i = 0; i < out.length; i++) {
    if (out[i]?.trim()) last = out[i].trim();
    else if (last) out[i] = last;
  }
  return out;
}

/** Inc 14 uses "Status", "Status A1", "Status A2" under each assignment title. */
function isStatusSubHeader(header: string): boolean {
  const h = header.trim().toLowerCase();
  return h === 'status' || /^status(\s|$)/.test(h);
}

/** Graduation sheet, e.g. "Overall Graduate" or "Overall_to_be_graduated". */
export function isGraduateSheetName(name: string): boolean {
  return normalizeSheetKey(name).includes('graduat');
}

/**
 * Roster column for the endline survey status. The name avoids "endline" so
 * assignment detectors do not count it as an assignment.
 */
export const SURVEY_STATUS_COLUMN = 'Graduation Survey Status';
export const SURVEY_NOT_SUBMITTED = 'Not Submitted';

export function normalizeSurveyStatus(raw: string): string {
  const s = String(raw ?? '').trim();
  if (!s || /^#?n\/?a$/i.test(s) || /^#(value|ref|div\/0|null|name)!?$/i.test(s) || s === '0' || /^-+$/.test(s)) {
    return SURVEY_NOT_SUBMITTED;
  }
  if (/^(no|false|not\s*submitted|pending|no\s*submission)$/i.test(s)) return SURVEY_NOT_SUBMITTED;
  if (/^(1|yes|true|y|done|filled)$/i.test(s)) return 'Submitted';
  return s;
}

export function isSurveySubmitted(status: string): boolean {
  return normalizeSurveyStatus(status) !== SURVEY_NOT_SUBMITTED;
}

function normalizeStudentIdKey(raw: string): string {
  const s = String(raw ?? '').trim();
  if (/^\d+(\.0+)?$/.test(s)) return String(parseInt(s, 10));
  return s.toLowerCase();
}

function findStudentIdCol(headers: string[]): number {
  return headers.findIndex(h => {
    const k = String(h ?? '').toLowerCase().replace(/[^a-z]/g, '');
    return k === 'studentid' || k === 'id';
  });
}

function findSurveyCol(headers: string[]): number {
  const flat = headers.map(h => String(h ?? '').toLowerCase().replace(/\s+/g, ' '));
  const endline = flat.findIndex(h => h.includes('endline'));
  if (endline >= 0) return endline;
  return flat.findIndex(h => /(survey|form)/.test(h) && /(status|submi)/.test(h));
}

/** Endline survey status from the graduation sheet, keyed by email and student ID. */
export function parseGraduateSurveyStatus(rows: string[][]): { byEmail: Map<string, string>; byId: Map<string, string> } {
  const byEmail = new Map<string, string>();
  const byId = new Map<string, string>();
  const limit = Math.min(rows.length, 15);
  for (let h = 0; h < limit; h++) {
    const headers = rows[h] ?? [];
    const emailIdx = findEmailCol(headers);
    const idIdx = findStudentIdCol(headers);
    const surveyIdx = findSurveyCol(headers);
    if ((emailIdx < 0 && idIdx < 0) || surveyIdx < 0) continue;
    for (let r = h + 1; r < rows.length; r++) {
      const row = rows[r] ?? [];
      const status = normalizeSurveyStatus(row[surveyIdx] ?? '');
      const email = emailIdx >= 0 ? normalizeEmail(row[emailIdx] ?? '') : '';
      if (isValidEmail(email)) byEmail.set(email, status);
      const id = idIdx >= 0 ? normalizeStudentIdKey(row[idIdx] ?? '') : '';
      if (id) byId.set(id, status);
    }
    break;
  }
  return { byEmail, byId };
}

export interface AssessmentPerfMerge {
  assignmentColumns: string[];
  quizColumns: string[];
  /** Extra roster columns, e.g. the graduation survey status. */
  otherColumns?: string[];
  /** student ID → survey status, for graduation sheets without an email column. */
  surveyById?: Map<string, string>;
  byEmail: Map<string, Record<string, string>>;
  /** email → normalized assignment key → facilitator feedback from Assignment_Source */
  feedbackByEmail: Map<string, Map<string, string>>;
}

/**
 * Parse Assignment_Source (long format): Col C email, Col K feedback, Col R assignment name.
 */
export function parseAssignmentSourceFeedback(
  rows: string[][],
): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  if (!rows.length) return out;

  let start = 0;
  const header = rows[0] ?? [];
  const headerC = (header[ASSIGNMENT_SOURCE_EMAIL_COL] ?? '').toLowerCase();
  const headerK = (header[ASSIGNMENT_SOURCE_FEEDBACK_COL] ?? '').toLowerCase();
  const headerR = (header[ASSIGNMENT_SOURCE_NAME_COL] ?? '').toLowerCase();
  if (
    headerC.includes('email')
    || headerK.includes('feedback')
    || headerK.includes('comment')
    || headerR.includes('assignment')
  ) {
    start = 1;
  }

  for (let r = start; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const email = normalizeEmail(row[ASSIGNMENT_SOURCE_EMAIL_COL] ?? '');
    if (!isValidEmail(email)) continue;
    const feedback = (row[ASSIGNMENT_SOURCE_FEEDBACK_COL] ?? '').trim();
    const assignName = (row[ASSIGNMENT_SOURCE_NAME_COL] ?? '').trim();
    if (!feedback || !assignName) continue;

    const key = normalizeAssignmentKey(assignName);
    if (!key) continue;

    const byAssign = out.get(email) ?? new Map<string, string>();
    // Keep the longest feedback if duplicates exist for the same assignment.
    const prev = byAssign.get(key) ?? '';
    if (!prev || feedback.length >= prev.length) byAssign.set(key, feedback);
    out.set(email, byAssign);
  }

  return out;
}

function lookupAssignmentFeedback(
  feedbackMap: Map<string, string>,
  assignmentCol: string,
): string {
  const base = normalizeAssignmentKey(assignmentCol);
  if (!base) return '';
  const exact = feedbackMap.get(base);
  if (exact) return exact;
  for (const [key, value] of feedbackMap) {
    if (!key || !value) continue;
    if (key === base || key.startsWith(base) || base.startsWith(key)) return value;
  }
  return '';
}

/**
 * Parse Assignment_Perf (status per assignment) and Quiz_Perf (Quiz 1..N scores)
 * into email-keyed fields that match the dashboard's AssignmentN_* / Quiz N Score naming.
 */
export function parseAssessmentPerfSheets(
  sheets: { name: string; rows: string[][] }[],
): AssessmentPerfMerge {
  const byEmail = new Map<string, Record<string, string>>();
  const assignmentColumns: string[] = [];
  const quizColumns: string[] = [];
  let feedbackByEmail = new Map<string, Map<string, string>>();

  const assignSheet = sheets.find(s => isAssignmentPerfSheetName(s.name));
  if (assignSheet && assignSheet.rows.length >= 3) {
    const titleRow = fillForwardTitles(assignSheet.rows[0] ?? []);
    const headerRow = assignSheet.rows[1] ?? [];
    const emailIdx = findEmailCol(headerRow);
    if (emailIdx >= 0) {
      const statusCols: { idx: number; name: string }[] = [];
      let assignNum = 0;
      for (let i = 0; i < headerRow.length; i++) {
        if (!isStatusSubHeader(headerRow[i] ?? '')) continue;
        const title = (titleRow[i] ?? '').trim() || `Assignment ${assignNum + 1}`;
        assignNum += 1;
        const colName = `Assignment${assignNum}_${title.replace(/\s+/g, ' ').trim()}`;
        statusCols.push({ idx: i, name: colName });
        assignmentColumns.push(colName);
      }

      for (let r = 2; r < assignSheet.rows.length; r++) {
        const row = assignSheet.rows[r];
        if (!row) continue;
        const email = normalizeEmail(row[emailIdx] ?? '');
        if (!isValidEmail(email)) continue;
        const fields = byEmail.get(email) ?? {};
        for (const col of statusCols) {
          const raw = (row[col.idx] ?? '').trim();
          fields[col.name] = raw || 'No Submission';
        }
        byEmail.set(email, fields);
      }
    }
  }

  const quizSheet = sheets.find(s => isQuizPerfSheetName(s.name));
  if (quizSheet) {
    for (const col of ingestQuizSheet(quizSheet, byEmail)) {
      if (!quizColumns.includes(col)) quizColumns.push(col);
    }
  }

  // Per-column fill from Quiz_Source (new quizzes often exist only here, or Quiz_Perf has blank formulas).
  const quizSource = sheets.find(s => isQuizSourceSheetName(s.name));
  if (quizSource) {
    for (const col of ingestQuizSheet(quizSource, byEmail, { onlyFillMissing: true })) {
      if (!quizColumns.includes(col)) quizColumns.push(col);
    }
  }

  const sourceSheet = sheets.find(s => isAssignmentSourceSheetName(s.name));
  if (sourceSheet?.rows.length) {
    feedbackByEmail = parseAssignmentSourceFeedback(sourceSheet.rows);
  }

  const otherColumns: string[] = [];
  let surveyById: Map<string, string> | undefined;
  const graduateSheets = sheets.filter(s => isGraduateSheetName(s.name));
  for (const graduateSheet of graduateSheets) {
    const survey = parseGraduateSurveyStatus(graduateSheet.rows);
    if (!survey.byEmail.size && !survey.byId.size) continue;
    otherColumns.push(SURVEY_STATUS_COLUMN);
    for (const [email, status] of survey.byEmail) {
      const fields = byEmail.get(email) ?? {};
      fields[SURVEY_STATUS_COLUMN] = status;
      byEmail.set(email, fields);
    }
    if (survey.byId.size) surveyById = survey.byId;
    break;
  }

  return { assignmentColumns, quizColumns, otherColumns, surveyById, byEmail, feedbackByEmail };
}

export function mergeAssessmentPerfIntoRows(
  headers: string[],
  rawRows: Record<string, string>[],
  merge: AssessmentPerfMerge,
): { headers: string[]; rawRows: Record<string, string>[] } {
  if (!merge.byEmail.size && !merge.feedbackByEmail.size && !merge.surveyById?.size) return { headers, rawRows };

  const emailKey = headers.find(h => /^email$/i.test(h.trim()))
    ?? headers.find(h => /email/i.test(h));
  if (!emailKey) return { headers, rawRows };
  const idKey = headers.find(h => h.toLowerCase().replace(/[^a-z]/g, '') === 'studentid');

  const extraHeaders = [...merge.assignmentColumns, ...merge.quizColumns, ...(merge.otherColumns ?? [])]
    .filter(h => !headers.includes(h));
  let nextHeaders = [...headers, ...extraHeaders];

  const nextRows = rawRows.map(row => {
    const email = normalizeEmail(row[emailKey] ?? '');
    const extra = merge.byEmail.get(email);
    const next = extra ? { ...row } : { ...row };
    if (extra) {
      for (const [key, value] of Object.entries(extra)) {
        if (!value && String(next[key] ?? '').trim()) continue;
        next[key] = value;
      }
    }

    const feedbackMap = merge.feedbackByEmail.get(email);
    if (feedbackMap?.size) {
      const assignCols = [
        ...merge.assignmentColumns,
        ...Object.keys(next).filter(k =>
          !isAssignmentCommentColumn(k)
          && (/^assignment\d+/i.test(k.replace(/\s+/g, '')) || /assignment/i.test(k)),
        ),
      ];
      const seen = new Set<string>();
      for (const col of assignCols) {
        if (seen.has(col) || isAssignmentCommentColumn(col)) continue;
        seen.add(col);
        const feedback = lookupAssignmentFeedback(feedbackMap, col);
        if (!feedback) continue;
        const commentCol = `${col}_comments`;
        next[commentCol] = feedback;
        if (!nextHeaders.includes(commentCol)) nextHeaders = [...nextHeaders, commentCol];
      }
    }

    if (merge.otherColumns?.includes(SURVEY_STATUS_COLUMN) && !String(next[SURVEY_STATUS_COLUMN] ?? '').trim()) {
      const byId = idKey && merge.surveyById?.get(normalizeStudentIdKey(row[idKey] ?? ''));
      next[SURVEY_STATUS_COLUMN] = byId || SURVEY_NOT_SUBMITTED;
    }

    return next;
  });

  return { headers: nextHeaders, rawRows: nextRows };
}

export async function loadAssessmentPerfFromFile(
  file: File,
  cachedBuffer?: ArrayBuffer,
): Promise<AssessmentPerfMerge | null> {
  const buffer = cachedBuffer ?? await readFileAsArrayBuffer(file);
  const wb = await loadWorkbookFromBuffer(buffer);
  const sheets = wb.worksheets
    .filter(ws =>
      isAssignmentPerfSheetName(ws.name)
      || isQuizPerfSheetName(ws.name)
      || isQuizSourceSheetName(ws.name)
      || isAssignmentSourceSheetName(ws.name)
      || isGraduateSheetName(ws.name),
    )
    .map(ws => ({
      name: ws.name,
      rows: readSheetRows(
        ws,
        isAssignmentSourceSheetName(ws.name)
          ? ASSIGNMENT_SOURCE_NAME_COL + 1
          : isGraduateSheetName(ws.name)
            ? Math.max(ws.columnCount ?? 0, ws.actualColumnCount ?? 0, 1)
            : 1,
      ),
    }));
  if (!sheets.length) return null;
  const parsed = parseAssessmentPerfSheets(sheets);
  if (!parsed.byEmail.size && !parsed.feedbackByEmail.size && !parsed.surveyById?.size) return null;
  return parsed;
}

/** Tiny helper kept for tests that pass cell objects. */
export function cellText(value: unknown): string {
  return excelCellToString({ value });
}
