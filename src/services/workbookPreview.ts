import type { SheetPreview, WorkbookPreview } from '../types/productionTypes';
import { readExcelRow } from './excelCellValue';
import { loadWorkbookFromBuffer, readFileAsArrayBuffer } from './workbookBuffer';
import { filterAllowedCohortSheets, recommendImportSheet } from './sheetSelection';
import { isDailyAttendanceSheetName } from './classWiseAttendance';
import { isAssignmentPerfSheetName } from './assessmentPerfSheets';

export async function previewWorkbook(file: File, cachedBuffer?: ArrayBuffer): Promise<WorkbookPreview> {
  const buffer = cachedBuffer ?? await readFileAsArrayBuffer(file);
  const wb = await loadWorkbookFromBuffer(buffer);

  const allSheets: SheetPreview[] = wb.worksheets.map(ws => {
    const rowCount = Math.max(0, (ws.rowCount ?? 0) - 1);
    const headerSourceRow = isDailyAttendanceSheetName(ws.name) || isAssignmentPerfSheetName(ws.name) ? 2 : 1;
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
