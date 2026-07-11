import type { ColumnMapping } from '../types/dynamicSchema';
import {
  classifyAssignmentStatus,
  listAssignmentStatusColumns,
} from './studentAssignmentDisplay';
import { isPreRecordedColumnHeader, isSessionColumnHeader, normalizeSessionHours } from './classWiseAttendance';
import {
  findActivityStatusColumn,
  normalizeActivityStatus,
  type ActivityLevel,
} from './programOverviewMetrics';
import { findInterventionColumn } from './weeklyAdminMetrics';

type RawRow = Record<string, string>;

export interface WeeklyColumnGroup {
  week: string;
  weekNum: number;
  attendanceCols: string[];
  assignmentCols: string[];
  quizCols: string[];
}

export interface WeeklyBreakdownPoint {
  week: string;
  weekNum: number;
  attendanceCount: number;
  assignmentsSubmitted: number;
  assignmentsAccepted: number;
  quizSubmissions: number;
  highlyActive: number;
  active: number;
  partiallyActive: number;
  inactive: number;
  studentsInCategory: number;
}

export interface WeekComparisonRow {
  metric: string;
  weekA: number;
  weekB: number;
  delta: number;
  deltaPct: number | null;
}

const ACTIVITY_CHART_LEVELS: ActivityLevel[] = ['Highly Active', 'Active', 'Partially Active'];

export const WEEKLY_CHART_COLORS = {
  attendance: '#16a34a',
  submitted: '#d97706',
  accepted: '#2563eb',
  quiz: '#7c3aed',
  highlyActive: '#16a34a',
  active: '#3b82f6',
  partiallyActive: '#f59e0b',
} as const;

function normCol(key: string): string {
  return key.replace(/^\uFEFF/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseNumeric(raw: string): number | null {
  const text = (raw ?? '').trim();
  if (!text) return null;
  const m = text.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function parseSessionValue(raw: string): number {
  const n = parseNumeric(raw);
  if (n == null) return 0;
  return normalizeSessionHours(n);
}

/** Extract WK bucket from column header, e.g. WK0_SUK..., Pre-recorded_WK3_V1. */
export function parseWeekLabelFromHeader(header: string): string | null {
  const h = (header ?? '').replace(/^\uFEFF/, '').trim();
  if (!h) return null;
  const wk = h.match(/WK(\d+)/i);
  if (wk) return `WK${wk[1]}`;
  const wPrefix = h.match(/^W(\d{1,2})[_\s]/i);
  if (wPrefix) return `WK${wPrefix[1]}`;
  const weekWord = h.match(/\bweek\s*(\d+)\b/i);
  if (weekWord) return `WK${weekWord[1]}`;
  return null;
}

function weekSortKey(week: string): number {
  const m = week.match(/^WK(\d+)$/i);
  return m ? Number(m[1]) : 999;
}

function isAssignmentLikeColumn(col: string): boolean {
  const l = col.toLowerCase();
  return (
    l.includes('assignment')
    || ['swot', 'resume', 'career exploration', 'career planner', 'vision board', 'endline'].some(k => l.includes(k))
  );
}

function isQuizLikeColumn(col: string): boolean {
  const l = col.toLowerCase();
  return (l.includes('quiz') || l.includes('assessment') || l.includes('mcq')) && !l.includes('final score');
}

function isAttendanceLikeColumn(col: string): boolean {
  if (isAssignmentLikeColumn(col) || isQuizLikeColumn(col)) return false;
  if (isPreRecordedColumnHeader(col)) return true;
  if (isSessionColumnHeader(col)) return true;
  const week = parseWeekLabelFromHeader(col);
  if (!week) return false;
  const nk = normCol(col);
  return nk.includes('suk') || nk.includes('ws') || nk.includes('mc') || nk.includes('saturday') || nk.includes('monday')
    || nk.includes('thursday') || nk.includes('session') || nk.includes('class');
}

function listAllAssignmentColumns(headers: string[], mapping: ColumnMapping | undefined): string[] {
  const fromMapping = mapping
    ? Object.entries(mapping)
        .filter(([, e]) => e.mappedRole === 'assignment' || e.mappedRole === 'academic')
        .map(([col]) => col)
    : [];
  const fromHeaders = headers.filter(isAssignmentLikeColumn);
  return listAssignmentStatusColumns(Array.from(new Set([...fromMapping, ...fromHeaders])), headers);
}

function listAllQuizColumns(headers: string[], mapping: ColumnMapping | undefined): string[] {
  const fromMapping = mapping
    ? Object.entries(mapping)
        .filter(([, e]) => e.mappedRole === 'assessment')
        .map(([col]) => col)
    : [];
  return Array.from(new Set([...fromMapping, ...headers.filter(isQuizLikeColumn)]));
}

export function buildWeeklyColumnGroups(headers: string[]): WeeklyColumnGroup[] {
  const assignmentCols = listAllAssignmentColumns(headers, undefined);
  const quizCols = listAllQuizColumns(headers, undefined);
  const attendanceCols = headers.filter(isAttendanceLikeColumn);

  const weekMap = new Map<string, WeeklyColumnGroup>();

  const ensure = (week: string) => {
    if (!weekMap.has(week)) {
      weekMap.set(week, {
        week,
        weekNum: weekSortKey(week),
        attendanceCols: [],
        assignmentCols: [],
        quizCols: [],
      });
    }
    return weekMap.get(week)!;
  };

  for (const col of attendanceCols) {
    const week = parseWeekLabelFromHeader(col);
    if (week) ensure(week).attendanceCols.push(col);
  }
  for (const col of assignmentCols) {
    const week = parseWeekLabelFromHeader(col);
    if (week) ensure(week).assignmentCols.push(col);
  }
  for (const col of quizCols) {
    const week = parseWeekLabelFromHeader(col);
    if (week) ensure(week).quizCols.push(col);
  }

  return Array.from(weekMap.values()).sort((a, b) => a.weekNum - b.weekNum);
}

function isSubmittedAssignment(value: string): boolean {
  const kind = classifyAssignmentStatus(value);
  return kind !== 'pending';
}

function isAcceptedAssignment(value: string): boolean {
  const s = value.toLowerCase().trim();
  if (!s || s.length > 56) return false;
  if (s.includes('rejected') || s.includes('no submission')) return false;
  if (s.includes('submitted') && !s.includes('accepted')) return false;
  return s.includes('accepted') || s.includes('complete') || s.includes('completed') || s.includes('pass');
}

function isQuizSubmitted(value: string): boolean {
  const s = (value ?? '').trim();
  if (!s) return false;
  const lower = s.toLowerCase();
  if (['no submission', 'not submitted', 'pending', 'n/a', 'na', '-'].some(k => lower.includes(k))) return false;
  const n = parseNumeric(s);
  if (n != null && n > 0) return true;
  return s.length > 0;
}

function rowMatchesCategory(row: RawRow, categoryCol: string | null, categoryFilter: string): boolean {
  if (categoryFilter === 'all') return true;
  if (!categoryCol) return categoryFilter === 'All students';
  const g = (row[categoryCol] ?? '').trim() || 'Unspecified';
  return g === categoryFilter;
}

function attendedAnySession(row: RawRow, cols: string[]): boolean {
  return cols.some(col => parseSessionValue(row[col] ?? '') > 0);
}

export function computeWeeklyBreakdown(
  rows: RawRow[],
  headers: string[],
  mapping: ColumnMapping | undefined,
  categoryFilter = 'all',
): WeeklyBreakdownPoint[] {
  const groups = buildWeeklyColumnGroups(headers);
  if (!groups.length) return [];

  const categoryCol = findInterventionColumn(headers, mapping);
  const statusCol = findActivityStatusColumn(headers, mapping);
  const filteredRows = rows.filter(r => rowMatchesCategory(r, categoryCol, categoryFilter));

  return groups.map(group => {
    let attendanceCount = 0;
    let assignmentsSubmitted = 0;
    let assignmentsAccepted = 0;
    let quizSubmissions = 0;
    let highlyActive = 0;
    let active = 0;
    let partiallyActive = 0;
    let inactive = 0;

    for (const row of filteredRows) {
      const attended = attendedAnySession(row, group.attendanceCols);
      if (attended) attendanceCount += 1;

      for (const col of group.assignmentCols) {
        const val = (row[col] ?? '').trim();
        if (isSubmittedAssignment(val)) assignmentsSubmitted += 1;
        if (isAcceptedAssignment(val)) assignmentsAccepted += 1;
      }

      for (const col of group.quizCols) {
        if (isQuizSubmitted(row[col] ?? '')) quizSubmissions += 1;
      }

      if (attended && statusCol) {
        const tier = normalizeActivityStatus(row[statusCol]);
        if (tier === 'Highly Active') highlyActive += 1;
        else if (tier === 'Active') active += 1;
        else if (tier === 'Partially Active') partiallyActive += 1;
        else inactive += 1;
      }
    }

    return {
      week: group.week,
      weekNum: group.weekNum,
      attendanceCount,
      assignmentsSubmitted,
      assignmentsAccepted,
      quizSubmissions,
      highlyActive,
      active,
      partiallyActive,
      inactive,
      studentsInCategory: filteredRows.length,
    };
  });
}

export function listWeeklyCategoryOptions(
  rows: RawRow[],
  headers: string[],
  mapping: ColumnMapping | undefined,
): { value: string; label: string; count: number }[] {
  const col = findInterventionColumn(headers, mapping);
  if (!col) return [{ value: 'all', label: 'All students', count: rows.length }];
  const counts = new Map<string, number>();
  for (const row of rows) {
    const g = (row[col] ?? '').trim() || 'Unspecified';
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  return [
    { value: 'all', label: 'All categories', count: rows.length },
    ...Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([g, count]) => ({ value: g, label: g, count })),
  ];
}

export function compareTwoWeeks(
  points: WeeklyBreakdownPoint[],
  weekA: string,
  weekB: string,
): WeekComparisonRow[] {
  const a = points.find(p => p.week === weekA);
  const b = points.find(p => p.week === weekB);
  if (!a || !b) return [];

  const metrics: { key: keyof WeeklyBreakdownPoint; label: string }[] = [
    { key: 'attendanceCount', label: 'Students attended' },
    { key: 'assignmentsSubmitted', label: 'Assignments submitted' },
    { key: 'assignmentsAccepted', label: 'Assignments accepted' },
    { key: 'quizSubmissions', label: 'Quiz submissions' },
    { key: 'highlyActive', label: 'Highly Active' },
    { key: 'active', label: 'Active' },
    { key: 'partiallyActive', label: 'Partially Active' },
  ];

  return metrics.map(({ key, label }) => {
    const va = Number(a[key] ?? 0);
    const vb = Number(b[key] ?? 0);
    const delta = vb - va;
    const deltaPct = va === 0 ? (vb > 0 ? 100 : 0) : Math.round((delta / va) * 1000) / 10;
    return { metric: label, weekA: va, weekB: vb, delta, deltaPct };
  });
}

export { ACTIVITY_CHART_LEVELS };
