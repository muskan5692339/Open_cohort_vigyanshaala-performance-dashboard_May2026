import type { DynamicAnalyticsResult } from './dynamicAnalytics';
import type { ExportMeta } from '../types/opsTypes';
import { filtersSummaryLabel } from './globalFilters';

type RawRow = Record<string, string>;

async function loadExcelJS() {
  const ExcelJS = await import('exceljs');
  return ExcelJS.default;
}

function metaRows(meta: ExportMeta): string[][] {
  return [
    ['Export Timestamp', meta.exportedAt],
    ['Record Count', String(meta.recordCount)],
    ['Applied Filters', filtersSummaryLabel(meta.appliedFilters)],
    ...(meta.fileName ? [['Source File', meta.fileName]] : []),
    [],
  ];
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function toCsv(rows: string[][]): string {
  return rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
}

export async function exportStudentTableCsv(
  rows: RawRow[],
  columns: string[],
  meta: ExportMeta,
) {
  const header = ['#', ...columns];
  const data = rows.map((row, i) => [String(i + 1), ...columns.map(c => row[c] ?? '')]);
  const csv = toCsv([...metaRows(meta), header, ...data]);
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `students-${meta.exportedAt.slice(0, 10)}.csv`);
}

export async function exportStudentTableXlsx(
  rows: RawRow[],
  columns: string[],
  meta: ExportMeta,
) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Students');
  for (const row of metaRows(meta)) ws.addRow(row);
  ws.addRow(['#', ...columns]);
  rows.forEach((row, i) => ws.addRow([i + 1, ...columns.map(c => row[c] ?? '')]));
  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf]), `students-${meta.exportedAt.slice(0, 10)}.xlsx`);
}

export async function exportRiskReportCsv(
  students: DynamicAnalyticsResult['riskMetrics']['students'],
  meta: ExportMeta,
) {
  const header = ['Student', 'Score', 'Category', 'Reasons'];
  const data = students.map(s => [s.studentLabel, String(s.score), s.category, s.reasons.join('; ')]);
  const csv = toCsv([...metaRows(meta), header, ...data]);
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `risk-report-${meta.exportedAt.slice(0, 10)}.csv`);
}

export async function exportRiskReportXlsx(
  students: DynamicAnalyticsResult['riskMetrics']['students'],
  meta: ExportMeta,
) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Risk Report');
  for (const row of metaRows(meta)) ws.addRow(row);
  ws.addRow(['Student', 'Score', 'Category', 'Reasons']);
  students.forEach(s => ws.addRow([s.studentLabel, s.score, s.category, s.reasons.join('; ')]));
  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf]), `risk-report-${meta.exportedAt.slice(0, 10)}.xlsx`);
}

export async function exportSummaryReportCsv(analytics: DynamicAnalyticsResult, meta: ExportMeta) {
  const rows: string[][] = [...metaRows(meta), ['Section', 'Metric', 'Value']];
  rows.push(['Summary', 'Total Students', String(analytics.summary.totalRows)]);
  rows.push(['Summary', 'Mapped Columns', String(analytics.summary.mappedColumns)]);

  for (const m of analytics.percentageMetrics) {
    rows.push(['Performance', m.column, `avg ${m.average}% | median ${m.median}%`]);
  }
  for (const m of analytics.statusMetrics) {
    rows.push(['Status', m.column, `completion ${m.completionRate}%`]);
  }
  for (const [cat, count] of Object.entries(analytics.riskMetrics.counts)) {
    rows.push(['Risk', cat, String(count)]);
  }

  const csv = toCsv(rows);
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `dashboard-summary-${meta.exportedAt.slice(0, 10)}.csv`);
}

export async function exportSummaryReportXlsx(analytics: DynamicAnalyticsResult, meta: ExportMeta) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Dashboard Summary');
  for (const row of metaRows(meta)) ws.addRow(row);
  ws.addRow(['Section', 'Metric', 'Value']);
  ws.addRow(['Summary', 'Total Students', analytics.summary.totalRows]);
  ws.addRow(['Summary', 'Mapped Columns', analytics.summary.mappedColumns]);
  for (const m of analytics.percentageMetrics) {
    ws.addRow(['Performance', m.column, `avg ${m.average}% | median ${m.median}%`]);
  }
  for (const m of analytics.statusMetrics) {
    ws.addRow(['Status', m.column, `completion ${m.completionRate}%`]);
  }
  for (const [cat, count] of Object.entries(analytics.riskMetrics.counts)) {
    ws.addRow(['Risk', cat, count]);
  }
  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf]), `dashboard-summary-${meta.exportedAt.slice(0, 10)}.xlsx`);
}

export function buildExportMeta(
  recordCount: number,
  appliedFilters: ExportMeta['appliedFilters'],
  fileName?: string,
): ExportMeta {
  return {
    exportedAt: new Date().toISOString(),
    recordCount,
    appliedFilters,
    fileName,
  };
}
