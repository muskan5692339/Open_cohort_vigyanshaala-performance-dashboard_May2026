function formatExcelDate(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isFormulaCell(cell: Record<string, unknown>): boolean {
  return typeof cell.formula === 'string' || typeof cell.sharedFormula === 'string';
}

/** Convert an ExcelJS cell value to a plain string for storage and display. */
export function normalizeExcelCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return formatExcelDate(v);
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v).trim();

  if (typeof v === 'object' && v) {
    const cell = v as Record<string, unknown>;

    if (typeof cell.error === 'string') return cell.error;

    // Formula cells (VLOOKUP, etc.) — use the cached result Excel saved in the file.
    if (isFormulaCell(cell)) {
      if (cell.result !== undefined && cell.result !== null) {
        return normalizeExcelCell(cell.result);
      }
      return '';
    }

    if (typeof cell.text === 'string' && cell.text.trim()) return cell.text.trim();

    if (typeof cell.hyperlink === 'string') {
      const link = cell.hyperlink.replace(/^mailto:/i, '').trim();
      if (link) return link;
    }

    if (cell.result !== undefined && cell.result !== null) {
      return normalizeExcelCell(cell.result);
    }

    if (Array.isArray(cell.richText)) {
      return (cell.richText as Array<{ text?: unknown }>)
        .map(part => String(part?.text ?? ''))
        .join('')
        .trim();
    }
  }

  return String(v).trim();
}

export interface ExcelReadableCell {
  value?: unknown;
  result?: unknown;
  text?: string | { richText?: Array<{ text?: unknown }> };
}

function cellDisplayText(cell: ExcelReadableCell): string {
  try {
    const t = cell.text;
    if (typeof t === 'string' && t.trim()) return t.trim();
    if (t && typeof t === 'object' && Array.isArray(t.richText)) {
      return t.richText.map(part => String(part?.text ?? '')).join('').trim();
    }
  } catch {
    // ExcelJS throws when reading .text on empty merged cells (MergeValue.toString).
  }
  return '';
}

/** Read a single ExcelJS cell — prefers raw value/result, then formatted text. */
export function excelCellToString(cell: ExcelReadableCell | null | undefined): string {
  if (!cell) return '';

  try {
    const raw = cell.result ?? cell.value;
    const fromValue = normalizeExcelCell(raw);
    if (fromValue) return fromValue;
  } catch {
    // ignore value read failures
  }

  const display = cellDisplayText(cell);
  if (display) return display;

  try {
    return normalizeExcelCell(cell.value);
  } catch {
    return '';
  }
}

export interface ExcelReadableRow {
  cellCount: number;
  getCell(col: number): ExcelReadableCell;
}

export function safeRowCellCount(row: ExcelReadableRow): number {
  const n = row.cellCount;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0;
}

/** Read all populated columns in a row, optionally padding to a fixed width. */
export function readExcelRow(row: ExcelReadableRow, minCols = 0): string[] {
  const count = Math.max(safeRowCellCount(row), minCols);
  if (!count) return [];
  return Array.from({ length: count }, (_, i) => {
    try {
      return excelCellToString(row.getCell(i + 1));
    } catch {
      return '';
    }
  });
}

/** True when a cell is a formula with no cached result in the workbook. */
export function isUncachedFormulaCell(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false;
  const cell = v as Record<string, unknown>;
  if (!isFormulaCell(cell)) return false;
  return cell.result === undefined || cell.result === null;
}
