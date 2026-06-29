import type { UploadValidationIssue, UploadValidationResult } from '../types/productionTypes';
import { excelCellToString, isUncachedFormulaCell } from './excelCellValue';

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_ROWS_WARNING = 10_000;
const SUPPORTED = /\.xlsx?$/i;

function issue(
  code: string,
  severity: UploadValidationIssue['severity'],
  message: string,
  suggestion?: string,
): UploadValidationIssue {
  return { code, severity, message, suggestion };
}

export async function validateUploadFile(file: File): Promise<UploadValidationResult> {
  const issues: UploadValidationIssue[] = [];

  if (!file) {
    return {
      valid: false,
      issues: [issue('NO_FILE', 'error', 'No file selected.', 'Choose an Excel workbook to upload.')],
      fileSizeBytes: 0,
      fileName: '',
    };
  }

  if (!SUPPORTED.test(file.name)) {
    issues.push(
      issue(
        'UNSUPPORTED_FORMAT',
        'error',
        `"${file.name}" is not a supported format.`,
        'Upload a .xlsx workbook. Legacy .xls may work but .xlsx is recommended.',
      ),
    );
  }

  if (file.size === 0) {
    issues.push(issue('EMPTY_FILE', 'error', 'The file is empty.', 'Export a valid workbook from Excel and try again.'));
  }

  if (file.size > MAX_FILE_BYTES) {
    issues.push(
      issue(
        'FILE_TOO_LARGE',
        'error',
        `File is ${(file.size / (1024 * 1024)).toFixed(1)} MB — limit is 25 MB.`,
        'Split the data or remove unused sheets before uploading.',
      ),
    );
  }

  let workbookOk = false;
  try {
    const ExcelJS = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    workbookOk = true;

    if (wb.worksheets.length === 0) {
      issues.push(issue('EMPTY_WORKBOOK', 'error', 'Workbook contains no sheets.', 'Add at least one data sheet.'));
    }

    const allEmpty = wb.worksheets.every(ws => (ws.rowCount ?? 0) <= 1);
    if (wb.worksheets.length > 0 && allEmpty) {
      issues.push(issue('ALL_SHEETS_EMPTY', 'error', 'All sheets appear empty.', 'Ensure headers and data rows exist.'));
    }

    for (const ws of wb.worksheets) {
      const rowCount = ws.rowCount ?? 0;
      if (rowCount <= 1) {
        issues.push(
          issue('EMPTY_SHEET', 'warning', `Sheet "${ws.name}" has no data rows.`, 'Select a different sheet or add data.'),
        );
        continue;
      }

      const headerRow = ws.getRow(1);
      const headers = Array.from({ length: headerRow.cellCount }, (_, i) =>
        excelCellToString(headerRow.getCell(i + 1)),
      );

      if (headers.every(h => !h)) {
        issues.push(
          issue(
            'MISSING_HEADERS',
            'error',
            `Sheet "${ws.name}" is missing column headers in row 1.`,
            'Add header names in the first row.',
          ),
        );
      }

      const seen = new Map<string, number>();
      headers.forEach(h => {
        if (!h) return;
        const key = h.toLowerCase();
        seen.set(key, (seen.get(key) ?? 0) + 1);
      });
      const dupes = [...seen.entries()].filter(([, c]) => c > 1).map(([h]) => h);
      if (dupes.length) {
        issues.push(
          issue(
            'DUPLICATE_HEADERS',
            'error',
            `Duplicate headers on "${ws.name}": ${dupes.join(', ')}`,
            'Rename duplicate columns so each header is unique.',
          ),
        );
      }

      const dataRows = rowCount - 1;
      if (dataRows > MAX_ROWS_WARNING) {
        issues.push(
          issue(
            'LARGE_FILE',
            'warning',
            `Sheet "${ws.name}" has ${dataRows.toLocaleString()} rows — processing may take longer.`,
            'Filtering and pagination remain available for large datasets.',
          ),
        );
      }

      const row2 = ws.getRow(2);
      const row2vals = (row2.values as unknown[]).slice(1).map(v => String(v ?? '').trim());
      const row3 = ws.getRow(3);
      const row3vals = (row3.values as unknown[]).slice(1).map(v => String(v ?? '').trim());
      const looksLikeSubHeader =
        row2vals.filter(Boolean).length > 0 &&
        row2vals.every(v => /^[a-z\s]+$/i.test(v) && v.length < 30) &&
        headers.filter(Boolean).length >= 3 &&
        row3vals.filter(Boolean).length >= headers.filter(Boolean).length * 0.5;
      if (looksLikeSubHeader) {
        issues.push(
          issue(
            'MIXED_HEADER_ROWS',
            'warning',
            `Sheet "${ws.name}" may have multiple header rows.`,
            'Confirm row 1 contains the final column names.',
          ),
        );
      }

      let uncachedFormulaCells = 0;
      const sampleRows = Math.min(rowCount, 51);
      for (let r = 2; r <= sampleRows; r++) {
        const row = ws.getRow(r);
        row.eachCell(cell => {
          if (isUncachedFormulaCell(cell.value) && !excelCellToString(cell).trim()) {
            uncachedFormulaCells++;
          }
        });
      }
      if (uncachedFormulaCells > 0) {
        issues.push(
          issue(
            'FORMULA_NO_CACHE',
            'warning',
            `Sheet "${ws.name}" has ${uncachedFormulaCells} formula cell(s) without saved values (e.g. VLOOKUP).`,
            'Open the workbook in Excel or Google Sheets, let formulas calculate, then download/save as .xlsx before uploading.',
          ),
        );
      }
    }
  } catch {
    if (!workbookOk) {
      issues.push(
        issue(
          'CORRUPT_WORKBOOK',
          'error',
          'Unable to read workbook — file may be corrupted or password-protected.',
          'Re-save the file in Excel as .xlsx and try again.',
        ),
      );
    }
  }

  const hasError = issues.some(i => i.severity === 'error');
  return {
    valid: !hasError,
    issues,
    fileSizeBytes: file.size,
    fileName: file.name,
  };
}
