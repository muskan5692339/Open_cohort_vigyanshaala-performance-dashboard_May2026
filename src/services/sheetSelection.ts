import type { WorkbookPreview } from '../types/productionTypes';

export function normalizeSheetKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Exact "Overall" sheet only — ignores Overall_to_be_graduated and similar. */
export function isOverallSheetName(name: string): boolean {
  return normalizeSheetKey(name) === 'overall';
}

export function isClassWiseAttendanceSheetName(name: string): boolean {
  const n = normalizeSheetKey(name);
  return n === 'classwiseattendance'
    || (n.includes('classwise') && n.includes('attendance'));
}

/** Only these two workbook sheets are used for cohort import. */
export function isAllowedCohortSheetName(name: string): boolean {
  return isOverallSheetName(name) || isClassWiseAttendanceSheetName(name);
}

export function filterAllowedCohortSheets<T extends { name: string }>(sheets: T[]): T[] {
  return sheets.filter(s => isAllowedCohortSheetName(s.name));
}

export function findOverallSheetName(sheetNames: string[]): string | null {
  return sheetNames.find(isOverallSheetName) ?? null;
}

/** True when headers look like the Class-wise Attendance sheet (sessions only). */
export function isClassWiseOnlySheet(headers: string[]): boolean {
  if (!headers.length) return false;
  const joined = headers.join(' ').toLowerCase();
  const hasEmail = headers.some(h => /^email$/i.test(h.trim()) || h.toLowerCase().includes('email'));
  const sessionCols = headers.filter(h => {
    const l = h.toLowerCase();
    return /wk\d|pre-recorded|pre recorded|_suk|_ws|_mc/.test(l);
  }).length;
  const hasPerfData = /assignment|swot|quiz|career exploration|career planner|vision board|final score|endline|resume/.test(joined);
  return hasEmail && sessionCols >= 3 && !hasPerfData;
}

export function sheetHasPerformanceColumns(headers: string[]): boolean {
  const joined = headers.join(' ').toLowerCase();
  return /assignment|swot|quiz|career exploration|career planner|vision board|final score|endline|resume|assessment/.test(joined);
}

/** Pick the sheet that contains assignments / quiz / wide-format perf data. */
export function findPerformanceSheetName(preview: WorkbookPreview): string | null {
  const overallExact = findOverallSheetName(preview.sheetNames);
  if (overallExact) {
    const sheet = preview.sheets.find(s => s.name === overallExact);
    if (sheet && !sheet.isEmpty) return overallExact;
  }

  const ranked = preview.sheets
    .filter(s => !s.isEmpty && s.columnCount >= 3)
    .filter(s => isAllowedCohortSheetName(s.name) || !preview.sheetNames.some(isOverallSheetName))
    .map(sheet => {
      const name = sheet.name.toLowerCase();
      const headers = sheet.headers;
      let score = 0;
      if (sheetHasPerformanceColumns(headers)) score += 100;
      if (/^overall$/i.test(sheet.name.trim())) score += 120;
      if (/student|perf|monitor|summary|overall|master|data/i.test(name)) score += 40;
      if (/to.?be.?graduat|graduated|alumni|archive/i.test(name)) score -= 200;
      if (/class.?wise|attendance/i.test(name)) score -= 80;
      if (isClassWiseOnlySheet(headers)) score -= 100;
      return { name: sheet.name, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.name ?? null;
}

export function recommendImportSheet(preview: WorkbookPreview): string | null {
  return findPerformanceSheetName(preview)
    ?? findOverallSheetName(preview.sheetNames)
    ?? preview.sheets.find(s => !s.isEmpty && isAllowedCohortSheetName(s.name) && !isClassWiseOnlySheet(s.headers))?.name
    ?? null;
}
