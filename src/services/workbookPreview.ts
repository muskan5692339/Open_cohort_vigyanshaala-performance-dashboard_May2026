import type { SheetPreview, WorkbookPreview } from '../types/productionTypes';
import { readExcelRow, type ExcelReadableRow } from './excelCellValue';
import { loadWorkbookFromBuffer, readFileAsArrayBuffer } from './workbookBuffer';
import { filterAllowedCohortSheets, recommendImportSheet } from './sheetSelection';
import {
  isDailyAttendanceSheetName,
  isOverallAttendanceSheetName,
  isWatchTimeAttendanceSheetName,
} from './classWiseAttendance';
import { isAssignmentPerfSheetName } from './assessmentPerfSheets';

function previewHeaderRow(ws: {
  name: string;
  rowCount?: number;
  getRow: (n: number) => ExcelReadableRow;
}): number {
  if (isDailyAttendanceSheetName(ws.name) || isAssignmentPerfSheetName(ws.name)) return 2;
  if (isOverallAttendanceSheetName(ws.name) || isWatchTimeAttendanceSheetName(ws.name)) {
    const limit = Math.min(12, Math.max(ws.rowCount ?? 1, 1));
    for (let r = 1; r <= limit; r++) {
      const row = ws.getRow(r);
      const cells = readExcelRow(row, Math.max(row.cellCount ?? 0, 8));
      if (cells.some(cell => /email/i.test(cell))) return r;
    }
  }
  return 1;
}

export async function previewWorkbook(file: File, cachedBuffer?: ArrayBuffer): Promise<WorkbookPreview> {
  const buffer = cachedBuffer ?? await readFileAsArrayBuffer(file);
  const wb = await loadWorkbookFromBuffer(buffer);

  const allSheets: SheetPreview[] = wb.worksheets.map(ws => {
    const rowCount = Math.max(0, (ws.rowCount ?? 0) - 1);
    const headerSourceRow = previewHeaderRow(ws);
    const headerRow = ws.getRow(headerSourceRow);
    const colCount = Math.max(headerRow.cellCount, ws.columnCount ?? 0);
    const headers = readExcelRow(headerRow, colCount).map((h, i) => h || `Column ${i + 1}`);
    const previewRows: string[][] = [];
    const firstDataRow = headerSourceRow + 1;
    for (let r = firstDataRow; r <= Math.min(firstDataRow + 9, ws.rowCount ?? 1); r++) {
      previewRows.push(readExcelRow(ws.getRow(r), colCount));
    }
    return {
      name: ws.name,
      rowCount,
      columnCount: headers.length,
      headers,
      previewRows,
      isEmpty: rowCount === 0,
    };
  });

  // Prefer only Overall + Class-wise Attendance when those sheets exist.
  const allowed = filterAllowedCohortSheets(allSheets);
  const sheets = allowed.length > 0 ? allowed : allSheets;

  const recommended = recommendImportSheet({
    sheetNames: sheets.map(s => s.name),
    sheets,
    recommendedSheet: null,
  });

  return {
    sheetNames: sheets.map(s => s.name),
    sheets,
    recommendedSheet: recommended,
  };
}
