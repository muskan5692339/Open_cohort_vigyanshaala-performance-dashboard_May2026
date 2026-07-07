import type { ColumnMapping } from '../types/dynamicSchema';
import type { UploadSnapshot, WeeklyInterventionStats } from '../types/intelligenceTypes';
import {
  classifyAssignmentStatus,
  listAssignmentStatusColumns,
} from './studentAssignmentDisplay';

type RawRow = Record<string, string>;

export interface WeeklyUploadMetrics {
  avgAttendance: number;
  avgProgramHours: number;
  avgQuizScore: number;
  assignmentsSubmitted: number;
  assignmentsReviewed: number;
  assignmentsAccepted: number;
  assignmentsPending: number;
  assignmentSlots: number;
  interventionBreakdown: WeeklyInterventionStats[];
}

const INTERVENTION_HINTS = [
  'student_cat',
  'student category',
  'student_category',
  'intervention',
  'institution category',
  'college category',
  'category',
];

const PROGRAM_HOURS_HINTS = [
  'program hours',
  'programme hours',
  'total hours',
  'no. of classes attended',
  'classes attended',
  'no of classes attended',
];

const ATTENDANCE_HINTS = ['attendance', 'attendance %', 'attendance percent'];
const QUIZ_HINTS = ['quiz', 'assessment'];

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

function parsePct(raw: string): number | null {
  const n = parseNumeric(raw);
  if (n == null) return null;
  const text = raw.trim();
  if (text.includes('%')) return Math.max(0, Math.min(100, n));
  if (n <= 1 && n >= 0) return Math.round(n * 100);
  return Math.max(0, Math.min(100, n));
}

function colsMatching(headers: string[], hints: string[]): string[] {
  return headers.filter(col => {
    const nk = normCol(col);
    return hints.some(h => nk.includes(normCol(h)));
  });
}

function colsByRole(mapping: ColumnMapping | undefined, role: string, types: string[]): string[] {
  if (!mapping) return [];
  return Object.entries(mapping)
    .filter(([, e]) => e.mappedRole === role && types.includes(e.mappedType))
    .map(([col]) => col);
}

function avgFromCols(row: RawRow, cols: string[], asPct = false): number | null {
  const vals = cols
    .map(c => (asPct ? parsePct(row[c] ?? '') : parseNumeric(row[c] ?? '')))
    .filter((n): n is number => n != null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function findInterventionColumn(
  headers: string[],
  mapping: ColumnMapping | undefined,
): string | null {
  for (const col of headers) {
    const nk = normCol(col);
    if (INTERVENTION_HINTS.some(h => nk.includes(normCol(h)))) return col;
  }
  if (mapping) {
    for (const [col, entry] of Object.entries(mapping)) {
      const nk = normCol(col);
      const isCategoryCol = entry.mappedType === 'category' || entry.mappedRole === 'demographic';
      if (isCategoryCol && (INTERVENTION_HINTS.some(h => nk.includes(normCol(h))) || nk.includes('cat'))) {
        return col;
      }
    }
  }
  return null;
}

function listAssignmentColumns(headers: string[], mapping: ColumnMapping | undefined): string[] {
  const fromMapping = mapping
    ? Object.entries(mapping)
        .filter(([, e]) => e.mappedRole === 'assignment' || e.mappedRole === 'academic')
        .map(([col]) => col)
    : [];
  const fromHeaders = headers.filter(col => {
    const l = col.toLowerCase();
    return (
      l.includes('assignment')
      || ['swot', 'resume', 'career exploration', 'career planner', 'vision board', 'endline'].some(k => l.includes(k))
    );
  });
  return listAssignmentStatusColumns(Array.from(new Set([...fromMapping, ...fromHeaders])), headers);
}

function listMetricColumns(headers: string[], mapping: ColumnMapping | undefined) {
  const attendanceCols = Array.from(new Set([
    ...colsByRole(mapping, 'attendance', ['percentage', 'numeric']),
    ...colsMatching(headers, ATTENDANCE_HINTS),
  ]));
  const quizCols = Array.from(new Set([
    ...colsByRole(mapping, 'assessment', ['percentage', 'numeric']),
    ...headers.filter(c => {
      const l = c.toLowerCase();
      return QUIZ_HINTS.some(h => l.includes(h)) && !l.includes('final score');
    }),
  ]));
  const programHoursCols = colsMatching(headers, PROGRAM_HOURS_HINTS);
  return { attendanceCols, quizCols, programHoursCols };
}

function slotStats(value: string): { submitted: number; reviewed: number; accepted: number; pending: number } {
  const kind = classifyAssignmentStatus(value);
  if (kind === 'pending') return { submitted: 0, reviewed: 0, accepted: 0, pending: 1 };
  if (kind === 'accepted') return { submitted: 1, reviewed: 1, accepted: 1, pending: 0 };
  if (kind === 'rejected') return { submitted: 1, reviewed: 1, accepted: 0, pending: 0 };
  if (kind === 'other' && value.trim()) return { submitted: 1, reviewed: 0, accepted: 0, pending: 0 };
  return { submitted: 0, reviewed: 0, accepted: 0, pending: 1 };
}

function emptyGroup(group: string): WeeklyInterventionStats {
  return {
    group,
    studentCount: 0,
    avgAttendance: 0,
    avgProgramHours: 0,
    avgQuizScore: 0,
    assignmentsSubmitted: 0,
    assignmentsReviewed: 0,
    assignmentsAccepted: 0,
    assignmentsPending: 0,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function computeWeeklyUploadMetrics(
  rows: RawRow[],
  headers: string[],
  mapping: ColumnMapping | undefined,
): WeeklyUploadMetrics {
  const assignmentCols = listAssignmentColumns(headers, mapping);
  const interventionCol = findInterventionColumn(headers, mapping);
  const { attendanceCols, quizCols, programHoursCols } = listMetricColumns(headers, mapping);

  const groupMap = new Map<string, WeeklyInterventionStats & {
    attSum: number; attN: number; hrsSum: number; hrsN: number; quizSum: number; quizN: number;
  }>();

  const ensureGroup = (group: string) => {
    const key = group.trim() || 'Unspecified';
    if (!groupMap.has(key)) {
      groupMap.set(key, { ...emptyGroup(key), attSum: 0, attN: 0, hrsSum: 0, hrsN: 0, quizSum: 0, quizN: 0 });
    }
    return groupMap.get(key)!;
  };

  const totals = {
    assignmentsSubmitted: 0,
    assignmentsReviewed: 0,
    assignmentsAccepted: 0,
    assignmentsPending: 0,
    assignmentSlots: 0,
    attSum: 0, attN: 0, hrsSum: 0, hrsN: 0, quizSum: 0, quizN: 0,
  };

  for (const row of rows) {
    const group = interventionCol ? (row[interventionCol] ?? '').trim() || 'Unspecified' : 'All students';
    const g = ensureGroup(group);
    g.studentCount += 1;

    const att = avgFromCols(row, attendanceCols, true);
    if (att != null) {
      g.attSum += att; g.attN += 1;
      totals.attSum += att; totals.attN += 1;
    }
    const hrs = avgFromCols(row, programHoursCols, false);
    if (hrs != null) {
      g.hrsSum += hrs; g.hrsN += 1;
      totals.hrsSum += hrs; totals.hrsN += 1;
    }
    const quiz = avgFromCols(row, quizCols, true);
    if (quiz != null) {
      g.quizSum += quiz; g.quizN += 1;
      totals.quizSum += quiz; totals.quizN += 1;
    }

    for (const col of assignmentCols) {
      const stats = slotStats((row[col] ?? '').trim());
      totals.assignmentsSubmitted += stats.submitted;
      totals.assignmentsReviewed += stats.reviewed;
      totals.assignmentsAccepted += stats.accepted;
      totals.assignmentsPending += stats.pending;
      totals.assignmentSlots += 1;
      g.assignmentsSubmitted += stats.submitted;
      g.assignmentsReviewed += stats.reviewed;
      g.assignmentsAccepted += stats.accepted;
      g.assignmentsPending += stats.pending;
    }
  }

  const interventionBreakdown = Array.from(groupMap.values()).map(g => ({
    group: g.group,
    studentCount: g.studentCount,
    avgAttendance: round1(g.attN ? g.attSum / g.attN : 0),
    avgProgramHours: round1(g.hrsN ? g.hrsSum / g.hrsN : 0),
    avgQuizScore: round1(g.quizN ? g.quizSum / g.quizN : 0),
    assignmentsSubmitted: g.assignmentsSubmitted,
    assignmentsReviewed: g.assignmentsReviewed,
    assignmentsAccepted: g.assignmentsAccepted,
    assignmentsPending: g.assignmentsPending,
  })).sort((a, b) => b.studentCount - a.studentCount);

  return {
    avgAttendance: round1(totals.attN ? totals.attSum / totals.attN : 0),
    avgProgramHours: round1(totals.hrsN ? totals.hrsSum / totals.hrsN : 0),
    avgQuizScore: round1(totals.quizN ? totals.quizSum / totals.quizN : 0),
    assignmentsSubmitted: totals.assignmentsSubmitted,
    assignmentsReviewed: totals.assignmentsReviewed,
    assignmentsAccepted: totals.assignmentsAccepted,
    assignmentsPending: totals.assignmentsPending,
    assignmentSlots: totals.assignmentSlots,
    interventionBreakdown,
  };
}

/** @deprecated use computeWeeklyUploadMetrics */
export function computeWeeklyAssignmentTotals(
  rows: RawRow[],
  headers: string[],
  mapping: ColumnMapping | undefined,
) {
  const m = computeWeeklyUploadMetrics(rows, headers, mapping);
  return {
    assignmentsSubmitted: m.assignmentsSubmitted,
    assignmentsReviewed: m.assignmentsReviewed,
    assignmentsAccepted: m.assignmentsAccepted,
    assignmentsPending: m.assignmentsPending,
    assignmentSlots: m.assignmentSlots,
    interventionBreakdown: m.interventionBreakdown,
  };
}

export function formatUploadLabel(iso: string, fileName?: string): string {
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return fileName ? `${date} ${time} · ${fileName}` : `${date} ${time}`;
  } catch {
    return fileName ?? iso;
  }
}

export function pctChange(current: number, previous: number | null | undefined): number | null {
  if (previous == null || !Number.isFinite(previous)) return null;
  if (previous === 0) return current > 0 ? 100 : 0;
  return round1(((current - previous) / previous) * 100);
}

export function isoWeekKey(iso: string): string {
  const d = new Date(iso);
  const day = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const weekDay = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekDay);
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((day.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function rollupSnapshotsWeekly(snapshots: UploadSnapshot[]): UploadSnapshot[] {
  const byWeek = new Map<string, UploadSnapshot>();
  for (const snap of snapshots) {
    const key = isoWeekKey(snap.uploadedAt);
    const existing = byWeek.get(key);
    if (!existing || snap.uploadedAt > existing.uploadedAt) {
      byWeek.set(key, snap);
    }
  }
  return Array.from(byWeek.values()).sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
}

export interface SnapshotChartPoint {
  label: string;
  fullLabel: string;
  uploadedAt: string;
  attendance: number;
  programHours: number;
  quizScore: number;
  submitted: number;
  reviewed: number;
  attendancePct: number | null;
  programHoursPct: number | null;
  quizScorePct: number | null;
  submittedPct: number | null;
  reviewedPct: number | null;
}

function pickMetrics(
  snap: UploadSnapshot,
  group: string | null,
): {
  attendance: number;
  programHours: number;
  quizScore: number;
  submitted: number;
  reviewed: number;
} {
  const m = snap.metrics;
  const b = group ? m.interventionBreakdown?.find(x => x.group === group) : null;
  return {
    attendance: b?.avgAttendance ?? m.avgAttendance ?? 0,
    programHours: b?.avgProgramHours ?? m.avgProgramHours ?? 0,
    quizScore: b?.avgQuizScore ?? m.avgQuizScore ?? m.avgAssessment ?? 0,
    submitted: b?.assignmentsSubmitted ?? m.assignmentsSubmitted ?? 0,
    reviewed: b?.assignmentsReviewed ?? m.assignmentsReviewed ?? 0,
  };
}

export function buildSnapshotChartSeries(
  snapshots: UploadSnapshot[],
  interventionFilter: string,
  weeklyRollup: boolean,
): SnapshotChartPoint[] {
  const ordered = weeklyRollup ? rollupSnapshotsWeekly(snapshots) : [...snapshots].sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
  const group = interventionFilter === 'all' ? null : interventionFilter;

  return ordered.map((snap, idx) => {
    const prev = idx > 0 ? ordered[idx - 1] : null;
    const cur = pickMetrics(snap, group);
    const prevM = prev ? pickMetrics(prev, group) : null;

    const d = new Date(snap.uploadedAt);
    const label = weeklyRollup
      ? isoWeekKey(snap.uploadedAt)
      : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

    return {
      label,
      fullLabel: formatUploadLabel(snap.uploadedAt, snap.fileName),
      uploadedAt: snap.uploadedAt,
      attendance: cur.attendance,
      programHours: cur.programHours,
      quizScore: cur.quizScore,
      submitted: cur.submitted,
      reviewed: cur.reviewed,
      attendancePct: pctChange(cur.attendance, prevM?.attendance),
      programHoursPct: pctChange(cur.programHours, prevM?.programHours),
      quizScorePct: pctChange(cur.quizScore, prevM?.quizScore),
      submittedPct: pctChange(cur.submitted, prevM?.submitted),
      reviewedPct: pctChange(cur.reviewed, prevM?.reviewed),
    };
  });
}
