import type { DiscoveredColumn } from '../types/dynamicSchema';
import type { ParsedStudent, ParsedAttendance, ParsedAssignment, ParsedQuiz, SyncError } from '../types/syncTypes';
import type { ClassWiseAttendanceEntry } from './classWiseAttendance';
import { parseWideFormatSheet } from './excelParser';
import {
  inferBusinessRole,
  inferColumnType,
  inferDisplayGroup,
} from './schemaInference';

function hashSignature(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h) + input.charCodeAt(i);
  return `sig_${(h >>> 0).toString(16)}`;
}

function normalizeExcelCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v).trim();
  if (typeof v === 'object' && v) {
    const cell = v as Record<string, unknown>;
    if (typeof cell.text === 'string') return cell.text.trim();
    if (typeof cell.result === 'string' || typeof cell.result === 'number') return String(cell.result).trim();
    if (Array.isArray(cell.richText)) {
      return (cell.richText as Array<{ text?: unknown }>)
        .map(part => String(part?.text ?? ''))
        .join('')
        .trim();
    }
    if (typeof cell.hyperlink === 'string' && typeof cell.text === 'string') return cell.text.trim();
    try {
      const asJson = JSON.stringify(cell);
      return asJson === '{}' ? '' : asJson;
    } catch {
      return '';
    }
  }
  return String(v).trim();
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

function isWideFormat(headers: string[]): boolean {
  const lower = headers.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ' '));
  const hasAttendance = lower.some(h => h.includes('attendance') || h.includes('attended'));
  const hasAssignment = lower.some(h => h.includes('assignment') || h.includes('quiz') || h.includes('score'));
  return hasAttendance && (hasAssignment || lower.some(h => h.includes('email')));
}

function readSheetRows(ws: { eachRow: (cb: (row: { values: unknown }) => void) => void; rowCount?: number }): string[][] {
  const out: string[][] = [];
  ws.eachRow(row => {
    out.push(
      (row.values as unknown[]).slice(1).map(v => normalizeExcelCell(v)),
    );
  });
  return out;
}

export async function parseWorkbookSheet(
  file: File,
  sheetName: string,
  cohort: string,
): Promise<{
  students: { data: ParsedStudent[]; errors: SyncError[] };
  attendance: { data: ParsedAttendance[]; errors: SyncError[] };
  assignments: { data: ParsedAssignment[]; errors: SyncError[] };
  quiz: { data: ParsedQuiz[]; errors: SyncError[] };
  _sheetsFound: string[];
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
  const actualNames = wb.worksheets.map(ws => ws.name);
  const ws = wb.getWorksheet(sheetName);
  if (!ws) {
    const e = { data: [] as never[], errors: [{ message: `Sheet "${sheetName}" not found` }] };
    return {
      students: e,
      attendance: e,
      assignments: e,
      quiz: e,
      _sheetsFound: actualNames,
      _sheetMapping: { students: sheetName },
      columnMapping: {},
      headers: [],
      rawRows: [],
      discoveredColumns: [],
      fileSignature: hashSignature(sheetName),
    };
  }

  const rows = readSheetRows(ws);
  const headers = rows[0] ?? [];
  const bodyRows = rows.slice(1);
  const now = new Date();
  const importDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  if (headers.length && isWideFormat(headers)) {
    const parsed = parseWideFormatSheet(rows, cohort, importDate);
    const rawRows = bodyRows.map(r =>
      Object.fromEntries(headers.map((h, i) => [h || `col_${i + 1}`, r[i] ?? ''])),
    );
    return {
      ...parsed,
      _sheetsFound: actualNames,
      _sheetMapping: { students: sheetName, attendance: sheetName, assignments: sheetName, quiz: sheetName },
      headers,
      rawRows,
      discoveredColumns: discoverColumns(headers, bodyRows),
      fileSignature: hashSignature(`${sheetName}|${headers.join('|')}`),
    };
  }

  const rawRows = bodyRows.map(r =>
    Object.fromEntries(headers.map((h, i) => [h || `col_${i + 1}`, r[i] ?? ''])),
  );
  const empty = { data: [] as never[], errors: [] as SyncError[] };
  return {
    students: empty,
    attendance: empty,
    assignments: empty,
    quiz: empty,
    _sheetsFound: actualNames,
    _sheetMapping: { students: sheetName },
    columnMapping: {},
    headers,
    rawRows,
    discoveredColumns: discoverColumns(headers, bodyRows),
    fileSignature: hashSignature(`${sheetName}|${headers.join('|')}`),
  };
}
