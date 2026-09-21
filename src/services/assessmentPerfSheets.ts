import { excelCellToString, readExcelRow, type ExcelReadableRow } from './excelCellValue';
import { loadWorkbookFromBuffer, readFileAsArrayBuffer } from './workbookBuffer';

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

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase().replace(/^mailto:/i, '').trim();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function readSheetRows(ws: {
  eachRow: (cb: (row: ExcelReadableRow) => void) => void;
  getRow: (n: number) => ExcelReadableRow;
}): string[][] {
  const colCount = Math.max(ws.getRow(1).cellCount, ws.getRow(2).cellCount, 1);
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

export interface AssessmentPerfMerge {
  assignmentColumns: string[];
  quizColumns: string[];
  byEmail: Map<string, Record<string, string>>;
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

  const assignSheet = sheets.find(s => isAssignmentPerfSheetName(s.name));
  if (assignSheet && assignSheet.rows.length >= 3) {
    const titleRow = fillForwardTitles(assignSheet.rows[0] ?? []);
    const headerRow = assignSheet.rows[1] ?? [];
    const emailIdx = findEmailCol(headerRow);
    if (emailIdx >= 0) {
      const statusCols: { idx: number; name: string }[] = [];
      let assignNum = 0;
      for (let i = 0; i < headerRow.length; i++) {
        const h = (headerRow[i] ?? '').trim().toLowerCase();
        if (h !== 'status') continue;
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
  if (quizSheet && quizSheet.rows.length >= 2) {
    // Quiz_Perf uses a single header row (row 1).
    const headerRow = quizSheet.rows[0] ?? [];
    const emailIdx = findEmailCol(headerRow);
    if (emailIdx >= 0) {
      const quizCols: { idx: number; name: string }[] = [];
      headerRow.forEach((h, i) => {
        const m = h.trim().match(/^quiz\s*(\d+)$/i);
        if (!m) return;
        const colName = `Quiz ${m[1]} Score`;
        quizCols.push({ idx: i, name: colName });
        quizColumns.push(colName);
      });

      for (let r = 1; r < quizSheet.rows.length; r++) {
        const row = quizSheet.rows[r];
        if (!row) continue;
        const email = normalizeEmail(row[emailIdx] ?? '');
        if (!isValidEmail(email)) continue;
        const fields = byEmail.get(email) ?? {};
        for (const col of quizCols) {
          const raw = (row[col.idx] ?? '').trim();
          fields[col.name] = raw;
        }
        byEmail.set(email, fields);
      }
    }
  }

  return { assignmentColumns, quizColumns, byEmail };
}

export function mergeAssessmentPerfIntoRows(
  headers: string[],
  rawRows: Record<string, string>[],
  merge: AssessmentPerfMerge,
): { headers: string[]; rawRows: Record<string, string>[] } {
  if (!merge.byEmail.size) return { headers, rawRows };

  const emailKey = headers.find(h => /^email$/i.test(h.trim()))
    ?? headers.find(h => /email/i.test(h));
  if (!emailKey) return { headers, rawRows };

  const extraHeaders = [...merge.assignmentColumns, ...merge.quizColumns]
    .filter(h => !headers.includes(h));
  const nextHeaders = [...headers, ...extraHeaders];

  const nextRows = rawRows.map(row => {
    const email = normalizeEmail(row[emailKey] ?? '');
    const extra = merge.byEmail.get(email);
    if (!extra) return row;
    return { ...row, ...extra };
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
    .filter(ws => isAssignmentPerfSheetName(ws.name) || isQuizPerfSheetName(ws.name))
    .map(ws => ({ name: ws.name, rows: readSheetRows(ws) }));
  if (!sheets.length) return null;
  const parsed = parseAssessmentPerfSheets(sheets);
  if (!parsed.byEmail.size) return null;
  return parsed;
}

/** Tiny helper kept for tests that pass cell objects. */
export function cellText(value: unknown): string {
  return excelCellToString({ value });
}
