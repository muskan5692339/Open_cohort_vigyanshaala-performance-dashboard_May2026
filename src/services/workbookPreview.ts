import type { SheetPreview, WorkbookPreview } from '../types/productionTypes';
import { readExcelRow } from './excelCellValue';

export async function previewWorkbook(file: File): Promise<WorkbookPreview> {
  const ExcelJS = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());

  const sheets: SheetPreview[] = wb.worksheets.map(ws => {
    const rowCount = Math.max(0, (ws.rowCount ?? 0) - 1);
    const headerRow = ws.getRow(1);
    const colCount = headerRow.cellCount;
    const headers = readExcelRow(headerRow).map((h, i) => h || `Column ${i + 1}`);
    const previewRows: string[][] = [];
    for (let r = 2; r <= Math.min(11, ws.rowCount ?? 1); r++) {
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

  const recommended =
    sheets.find(s => !s.isEmpty && s.columnCount >= 3 && /student|data|perf|monitor|summary/i.test(s.name))?.name ??
    sheets.find(s => !s.isEmpty)?.name ??
    sheets[0]?.name ??
    null;

  return {
    sheetNames: sheets.map(s => s.name),
    sheets,
    recommendedSheet: recommended,
  };
}
