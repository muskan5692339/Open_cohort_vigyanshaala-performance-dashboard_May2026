import type { ColumnMapping } from '../types/dynamicSchema';
import { classifyAssignmentStatus, listAssignmentStatusColumns } from './studentAssignmentDisplay';
import { findInterventionColumn } from './weeklyAdminMetrics';

type RawRow = Record<string, string>;

export type ActivityLevel = 'Highly Active' | 'Active' | 'Partially Active' | 'Inactive';

export const ACTIVITY_LEVELS: ActivityLevel[] = [
  'Highly Active',
  'Active',
  'Partially Active',
  'Inactive',
];

export const ACTIVITY_COLORS: Record<ActivityLevel, string> = {
  'Highly Active': '#16a34a',
  Active: '#3b82f6',
  'Partially Active': '#f59e0b',
  Inactive: '#9ca3af',
};

const STATUS_COLUMN_HINTS = [
  'current status',
  'current_status',
  'currentstatus',
  'engagement status',
  'activity status',
  'program status',
  'status',
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

function parsePct(raw: string): number {
  const text = (raw ?? '').trim();
  if (!text) return 0;
  const n = parseNumeric(text);
  if (n == null) return 0;
  if (text.includes('%')) return Math.max(0, Math.min(100, Math.round(n)));
  if (n <= 1 && n >= 0) return Math.round(n * 100);
  return Math.max(0, Math.min(100, Math.round(n)));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
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

function listQuizColumns(headers: string[], mapping: ColumnMapping | undefined): string[] {
  return Array.from(new Set([
    ...colsByRole(mapping, 'assessment', ['percentage', 'numeric']),
    ...headers.filter(c => {
      const l = c.toLowerCase();
      return QUIZ_HINTS.some(h => l.includes(h)) && !l.includes('final score');
    }),
  ]));
}

function listAttendanceColumns(headers: string[], mapping: ColumnMapping | undefined): string[] {
  return Array.from(new Set([
    ...colsByRole(mapping, 'attendance', ['percentage', 'numeric']),
    ...colsMatching(headers, ATTENDANCE_HINTS),
  ]));
}

function slotStats(value: string): { submitted: number; accepted: number } {
  const kind = classifyAssignmentStatus(value);
  if (kind === 'pending') return { submitted: 0, accepted: 0 };
  if (kind === 'accepted') return { submitted: 1, accepted: 1 };
  if (kind === 'rejected') return { submitted: 1, accepted: 0 };
  if (kind === 'other' && value.trim()) return { submitted: 1, accepted: 0 };
  return { submitted: 0, accepted: 0 };
}

/** Normalize Excel "current status" cell text into one of four activity tiers. */
export function normalizeActivityStatus(raw: string | undefined | null): ActivityLevel {
  const s = (raw ?? '').trim().toLowerCase();
  if (!s) return 'Inactive';

  if (s.includes('highly') && s.includes('active')) return 'Highly Active';
  if (s.includes('partially') || (s.includes('partial') && s.includes('active'))) return 'Partially Active';
  if (s.includes('inactive') || s.includes('not active') || s.includes('disengaged')) return 'Inactive';

  if (s === 'active' || (s.includes('active') && !s.includes('inactive'))) return 'Active';

  return 'Inactive';
}

/** Prefer Overall sheet column "current status"; fall back to similar headers. */
export function findActivityStatusColumn(headers: string[], mapping?: ColumnMapping): string | null {
  const ranked = headers
    .map(col => {
      const nk = normCol(col);
      let score = 0;
      if (nk === 'currentstatus') score = 100;
      else if (nk.includes('currentstatus')) score = 90;
      else if (nk.includes('engagementstatus')) score = 80;
      else if (nk.includes('activitystatus')) score = 75;
      else if (nk === 'status') score = 50;
      else if (nk.includes('status') && !nk.includes('certificate')) score = 40;

      for (let i = 0; i < STATUS_COLUMN_HINTS.length; i++) {
        const hint = normCol(STATUS_COLUMN_HINTS[i]);
        if (nk === hint || nk.includes(hint)) {
          score = Math.max(score, 95 - i * 5);
        }
      }

      if (mapping?.[col]?.mappedRole === 'engagement' || mapping?.[col]?.mappedType === 'status') {
        score += 10;
      }

      return { col, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.col ?? null;
}

function findNameColumn(headers: string[]): string | null {
  const exact = headers.find(h => {
    const nk = normCol(h);
    return nk === 'name' || nk === 'studentname' || nk === 'fullname';
  });
  if (exact) return exact;
  return headers.find(h => {
    const nk = normCol(h);
    return nk.includes('name') && !nk.includes('assignment') && !nk.includes('college');
  }) ?? null;
}

function findEmailColumn(headers: string[]): string | null {
  const exact = headers.find(h => normCol(h) === 'email');
  if (exact) return exact;
  return headers.find(h => {
    const nk = normCol(h);
    return nk.includes('email') || nk.includes('mailid');
  }) ?? null;
}

export interface ProgramStudentRecord {
  key: string;
  name: string;
  email: string;
  category: string;
  activityLevel: ActivityLevel;
  rawStatus: string;
  attendancePct: number;
  assignmentSubmissionPct: number;
  assignmentAcceptancePct: number;
  quizSubmissionPct: number;
  quizScoreAvg: number;
}

export interface ActivityDistribution {
  level: ActivityLevel;
  count: number;
  pct: number;
}

export interface CategoryOverview {
  category: string;
  studentCount: number;
  activity: ActivityDistribution[];
  assignmentSubmissionPct: number;
  assignmentAcceptancePct: number;
  avgQuizSubmissionPct: number;
  avgQuizScore: number;
}

export interface ProgramOverviewMetrics {
  totalStudents: number;
  statusColumn: string | null;
  statusSource: 'excel' | 'fallback';
  activity: ActivityDistribution[];
  assignmentSubmissionPct: number;
  assignmentAcceptancePct: number;
  avgQuizSubmissionPct: number;
  avgQuizScore: number;
  students: ProgramStudentRecord[];
  byCategory: CategoryOverview[];
}

function emptyActivityCounts(): Record<ActivityLevel, number> {
  return {
    'Highly Active': 0,
    Active: 0,
    'Partially Active': 0,
    Inactive: 0,
  };
}

function toDistribution(counts: Record<ActivityLevel, number>, total: number): ActivityDistribution[] {
  return ACTIVITY_LEVELS.map(level => ({
    level,
    count: counts[level],
    pct: total > 0 ? round1((counts[level] / total) * 100) : 0,
  }));
}

function avg(values: number[]): number {
  if (!values.length) return 0;
  return round1(values.reduce((a, b) => a + b, 0) / values.length);
}

export function computeProgramOverview(
  rows: RawRow[],
  headers: string[],
  mapping: ColumnMapping | undefined,
): ProgramOverviewMetrics {
  const statusCol = findActivityStatusColumn(headers, mapping);
  const categoryCol = findInterventionColumn(headers, mapping);
  const nameCol = findNameColumn(headers);
  const emailCol = findEmailColumn(headers);
  const assignmentCols = listAssignmentColumns(headers, mapping);
  const quizCols = listQuizColumns(headers, mapping);
  const attendanceCols = listAttendanceColumns(headers, mapping);

  const students: ProgramStudentRecord[] = [];
  const categoryMap = new Map<string, ProgramStudentRecord[]>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rawStatus = statusCol ? (row[statusCol] ?? '').trim() : '';
    const activityLevel = normalizeActivityStatus(rawStatus);
    const category = categoryCol ? (row[categoryCol] ?? '').trim() || 'Unspecified' : 'All students';

    const email = emailCol ? (row[emailCol] ?? '').trim() : '';
    const name = nameCol ? (row[nameCol] ?? '').trim() : '';
    const key = email || name || `row-${i + 1}`;

    let submitted = 0;
    let accepted = 0;
    const totalSlots = assignmentCols.length;
    for (const col of assignmentCols) {
      const stats = slotStats((row[col] ?? '').trim());
      submitted += stats.submitted;
      accepted += stats.accepted;
    }
    const assignmentSubmissionPct = totalSlots > 0 ? round1((submitted / totalSlots) * 100) : 0;
    const assignmentAcceptancePct = submitted > 0 ? round1((accepted / submitted) * 100) : 0;

    const quizFilled = quizCols.filter(c => (row[c] ?? '').trim() !== '').length;
    const quizSubmissionPct = quizCols.length > 0 ? round1((quizFilled / quizCols.length) * 100) : 0;
    const quizScoreAvg = quizCols.length > 0
      ? round1(quizCols.map(c => parsePct(row[c] ?? '')).reduce((a, b) => a + b, 0) / quizCols.length)
      : 0;

    const attVals = attendanceCols
      .map(col => ({ pct: parsePct(row[col] ?? ''), raw: (row[col] ?? '').trim() }))
      .filter(x => x.pct > 0 || x.raw !== '')
      .map(x => x.pct);
    const attendancePct = attVals.length ? round1(attVals.reduce((a, b) => a + b, 0) / attVals.length) : 0;

    const record: ProgramStudentRecord = {
      key,
      name: name || email || key,
      email,
      category,
      activityLevel,
      rawStatus,
      attendancePct,
      assignmentSubmissionPct,
      assignmentAcceptancePct,
      quizSubmissionPct,
      quizScoreAvg,
    };
    students.push(record);

    if (!categoryMap.has(category)) categoryMap.set(category, []);
    categoryMap.get(category)!.push(record);
  }

  const total = students.length;
  const activityCounts = emptyActivityCounts();
  for (const s of students) activityCounts[s.activityLevel] += 1;

  const byCategory: CategoryOverview[] = Array.from(categoryMap.entries())
    .map(([category, group]) => {
      const counts = emptyActivityCounts();
      for (const s of group) counts[s.activityLevel] += 1;
      return {
        category,
        studentCount: group.length,
        activity: toDistribution(counts, group.length),
        assignmentSubmissionPct: avg(group.map(s => s.assignmentSubmissionPct)),
        assignmentAcceptancePct: avg(group.map(s => s.assignmentAcceptancePct)),
        avgQuizSubmissionPct: avg(group.map(s => s.quizSubmissionPct)),
        avgQuizScore: avg(group.map(s => s.quizScoreAvg)),
      };
    })
    .sort((a, b) => b.studentCount - a.studentCount);

  const totalSubmitted = students.reduce((sum, s) => {
    const slots = assignmentCols.length;
    return sum + (slots * s.assignmentSubmissionPct) / 100;
  }, 0);
  const totalAccepted = students.reduce((sum, s) => {
    const slots = assignmentCols.length;
    const submitted = (slots * s.assignmentSubmissionPct) / 100;
    return sum + (submitted * s.assignmentAcceptancePct) / 100;
  }, 0);
  const cohortSlots = total * assignmentCols.length;

  return {
    totalStudents: total,
    statusColumn: statusCol,
    statusSource: statusCol ? 'excel' : 'fallback',
    activity: toDistribution(activityCounts, total),
    assignmentSubmissionPct: cohortSlots > 0 ? round1((totalSubmitted / cohortSlots) * 100) : avg(students.map(s => s.assignmentSubmissionPct)),
    assignmentAcceptancePct: totalSubmitted > 0 ? round1((totalAccepted / totalSubmitted) * 100) : avg(students.map(s => s.assignmentAcceptancePct)),
    avgQuizSubmissionPct: avg(students.map(s => s.quizSubmissionPct)),
    avgQuizScore: avg(students.map(s => s.quizScoreAvg)),
    students,
    byCategory: categoryCol ? byCategory : [],
  };
}
