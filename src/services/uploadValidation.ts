import type { UploadValidationIssue, UploadValidationResult } from '../types/productionTypes';
import { excelCellToString, isUncachedFormulaCell, type ExcelReadableRow } from './excelCellValue';
import { loadWorkbookFromBuffer, readFileAsArrayBuffer } from './workbookBuffer';
import { isAssignmentPerfSheetName } from './assessmentPerfSheets';
import { isDailyAttendanceSheetName } from './classWiseAttendance';
import {
  findOverallSheetName,
  isAllowedCohortSheetName,
  isClassWiseAttendanceSheetName,
} from './sheetSelection';

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_ROWS_WARNING = 10_000;
const SUPPORTED = /\.xlsx?$/i;

/** Header row used for uniqueness checks (1-based). Matches import readers. */
function validationHeaderRowIndex(sheetName: string): number {
  if (isDailyAttendanceSheetName(sheetName) || isAssignmentPerfSheetName(sheetName)) return 2;
  return 1;
}

/**
 * Headers for presence checks. Assignment_Perf uses parent titles (row 1)
 * over Status|Score (row 2) — composite names match how the sheet is structured.
 */
function headersForValidation(
  ws: { getRow: (n: number) => ExcelReadableRow },
  sheetName: string,
): string[] {
  const headerRowIdx = validationHeaderRowIndex(sheetName);
  const headerRow = ws.getRow(headerRowIdx);
  const cellCount = Math.max(headerRow.cellCount, ws.getRow(1).cellCount, 1);

  if (isAssignmentPerfSheetName(sheetName)) {
    const titleRow = ws.getRow(1);
    let lastTitle = '';
    const out: string[] = [];
    for (let i = 1; i <= cellCount; i++) {
      const title = excelCellToString(titleRow.getCell(i)).trim();
      if (title) lastTitle = title;
      const sub = excelCellToString(headerRow.getCell(i)).trim();
      if (!sub && !title) {
        out.push('');
        continue;
      }
      out.push(lastTitle && sub ? `${lastTitle} ${sub}` : sub || lastTitle);
    }
    return out;
  }

  return Array.from({ length: cellCount }, (_, i) =>
    excelCellToString(headerRow.getCell(i + 1)),
  );
}

function issue(
  code: string,
  severity: UploadValidationIssue['severity'],
  message: string,
  suggestion?: string,
): UploadValidationIssue {
  return { code, severity, message, suggestion };
}

export async function validateUploadFile(file: File, cachedBuffer?: ArrayBuffer): Promise<UploadValidationResult> {
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
    const buffer = cachedBuffer ?? await readFileAsArrayBuffer(file);
    const wb = await loadWorkbookFromBuffer(buffer);
    workbookOk = true;

    if (wb.worksheets.length === 0) {
      issues.push(issue('EMPTY_WORKBOOK', 'error', 'Workbook contains no sheets.', 'Add at least one data sheet.'));
    }

    const sheetNames = wb.worksheets.map(ws => ws.name);
    const overallName = findOverallSheetName(sheetNames);
    const classWiseName = sheetNames.find(isClassWiseAttendanceSheetName);
    const ignoredOtherSheets = sheetNames.filter(n => !isAllowedCohortSheetName(n));

    if (!overallName && !classWiseName) {
      issues.push(
        issue(
          'REQUIRED_SHEETS_MISSING',
          'error',
          'Workbook must include an "Overall" or "Overall Performance" sheet.',
          'Use a sheet named "Overall" or "Overall Performance". Other sheets are ignored.',
        ),
      );
    } else if (!overallName) {
      issues.push(
        issue(
          'OVERALL_SHEET_MISSING',
          'error',
          'Sheet "Overall" or "Overall Performance" was not found.',
          'Add or rename your main performance sheet to "Overall" or "Overall Performance".',
        ),
      );
    }

    if (ignoredOtherSheets.length) {
      issues.push(
        issue(
          'OTHER_SHEETS_IGNORED',
          'warning',
          `Ignoring ${ignoredOtherSheets.length} other sheet(s): ${ignoredOtherSheets.slice(0, 4).join(', ')}${ignoredOtherSheets.length > 4 ? '…' : ''}.`,
          'Only these sheets are imported when present: Overall Performance, Daily Attendance, Assignment_Perf, Quiz_Perf. Assignment_Source (feedback) and Quiz_Source are also read when needed.',
        ),
      );
    }

    const sheetsToValidate = wb.worksheets.filter(ws => isAllowedCohortSheetName(ws.name));

    const allEmpty = sheetsToValidate.length > 0
      && sheetsToValidate.every(ws => {
        const minRows = validationHeaderRowIndex(ws.name);
        return (ws.rowCount ?? 0) <= minRows;
      });
    if (sheetsToValidate.length > 0 && allEmpty) {
      issues.push(
        issue(
          'ALL_SHEETS_EMPTY',
          'error',
          'Overall / Class-wise Attendance sheets appear empty.',
          'Ensure headers and data rows exist.',
        ),
      );
    }

    for (const ws of sheetsToValidate) {
      const rowCount = ws.rowCount ?? 0;
      const minHeaderRows = validationHeaderRowIndex(ws.name);
      if (rowCount <= minHeaderRows) {
        issues.push(
          issue('EMPTY_SHEET', 'warning', `Sheet "${ws.name}" has no data rows.`, 'Select a different sheet or add data.'),
        );
        continue;
      }

      const headerRowIdx = validationHeaderRowIndex(ws.name);
      const headers = headersForValidation(ws, ws.name);

      if (headers.every(h => !h)) {
        issues.push(
          issue(
            'MISSING_HEADERS',
            'error',
            `Sheet "${ws.name}" is missing column headers in row ${headerRowIdx}.`,
            `Add header names in row ${headerRowIdx}.`,
          ),
        );
      }

      // Skip duplicate-header checks. Inc 14 sheets intentionally repeat parent titles
      // (Career Exploration / SWOT over Status|Score) and Daily Attendance row 1 has
      // repeating session counts — blocking on those prevents a valid workbook import.

      const dataRows = Math.max(0, rowCount - headerRowIdx);
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

      const subHeaderRow = ws.getRow(headerRowIdx + 1);
      const subHeaderVals = (subHeaderRow.values as unknown[]).slice(1).map(v => String(v ?? '').trim());
      const dataProbeRow = ws.getRow(headerRowIdx + 2);
      const dataProbeVals = (dataProbeRow.values as unknown[]).slice(1).map(v => String(v ?? '').trim());
      const looksLikeSubHeader =
        !isDailyAttendanceSheetName(ws.name) &&
        !isAssignmentPerfSheetName(ws.name) &&
        subHeaderVals.filter(Boolean).length > 0 &&
        subHeaderVals.every(v => /^[a-z\s]+$/i.test(v) && v.length < 30) &&
        headers.filter(Boolean).length >= 3 &&
        dataProbeVals.filter(Boolean).length >= headers.filter(Boolean).length * 0.5;
      if (looksLikeSubHeader) {
        issues.push(
          issue(
            'MIXED_HEADER_ROWS',
            'warning',
            `Sheet "${ws.name}" may have multiple header rows.`,
            `Confirm row ${headerRowIdx} contains the final column names.`,
          ),
        );
      }

      let uncachedFormulaCells = 0;
      const sampleRows = Math.min(rowCount, headerRowIdx + 50);
      for (let r = headerRowIdx + 1; r <= sampleRows; r++) {
        const row = ws.getRow(r);
        row.eachCell(cell => {
          try {
            if (isUncachedFormulaCell(cell.value) && !excelCellToString(cell).trim()) {
              uncachedFormulaCells++;
            }
          } catch {
            // Empty merged cells can throw inside ExcelJS when reading formatted text.
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
