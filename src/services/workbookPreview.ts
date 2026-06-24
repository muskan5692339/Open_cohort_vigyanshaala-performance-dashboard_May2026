import type { SheetPreview, WorkbookPreview } from '../types/productionTypes';

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

function readRowValues(row: { values: unknown }): string[] {
  return (row.values as unknown[]).slice(1).map(v => normalizeExcelCell(v));
}

export async function previewWorkbook(file: File): Promise<WorkbookPreview> {
  const ExcelJS = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());

  const sheets: SheetPreview[] = wb.worksheets.map(ws => {
    const rowCount = Math.max(0, (ws.rowCount ?? 0) - 1);
    const headerRow = ws.getRow(1);
    const headers = readRowValues(headerRow).map((h, i) => h || `Column ${i + 1}`);
    const previewRows: string[][] = [];
    for (let r = 2; r <= Math.min(11, ws.rowCount ?? 1); r++) {
      previewRows.push(readRowValues(ws.getRow(r)));
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
