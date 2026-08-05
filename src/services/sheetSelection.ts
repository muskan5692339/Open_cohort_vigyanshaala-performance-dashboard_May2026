import type { WorkbookPreview } from '../types/productionTypes';

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
  const ranked = preview.sheets
    .filter(s => !s.isEmpty && s.columnCount >= 3)
    .map(sheet => {
      const name = sheet.name.toLowerCase();
      const headers = sheet.headers;
      let score = 0;
      if (sheetHasPerformanceColumns(headers)) score += 100;
      if (/student|perf|monitor|summary|overall|master|data/i.test(name)) score += 40;
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
    ?? preview.sheets.find(s => !s.isEmpty && !isClassWiseOnlySheet(s.headers))?.name
    ?? preview.recommendedSheet
    ?? preview.sheetNames[0]
    ?? null;
}
