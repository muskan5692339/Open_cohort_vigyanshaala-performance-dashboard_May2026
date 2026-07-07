import type { ColumnMapping } from '../types/dynamicSchema';
import type { WeeklyInterventionStats } from '../types/intelligenceTypes';
import {
  classifyAssignmentStatus,
  listAssignmentStatusColumns,
} from './studentAssignmentDisplay';

type RawRow = Record<string, string>;

export interface WeeklyAssignmentTotals {
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

function normCol(key: string): string {
  return key.replace(/^\uFEFF/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function findInterventionColumn(
  headers: string[],
  mapping: ColumnMapping | undefined,
): string | null {
  for (const col of headers) {
    const nk = normCol(col);
    if (INTERVENTION_HINTS.some(h => nk.includes(normCol(h)))) {
      return col;
    }
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

function slotStats(value: string): { submitted: number; reviewed: number; accepted: number; pending: number } {
  const kind = classifyAssignmentStatus(value);
  if (kind === 'pending') return { submitted: 0, reviewed: 0, accepted: 0, pending: 1 };
  if (kind === 'accepted') return { submitted: 1, reviewed: 1, accepted: 1, pending: 0 };
  if (kind === 'rejected') return { submitted: 1, reviewed: 1, accepted: 0, pending: 0 };
  if (kind === 'other' && value.trim()) return { submitted: 1, reviewed: 0, accepted: 0, pending: 0 };
  return { submitted: 0, reviewed: 0, accepted: 0, pending: 1 };
}

export function computeWeeklyAssignmentTotals(
  rows: RawRow[],
  headers: string[],
  mapping: ColumnMapping | undefined,
): WeeklyAssignmentTotals {
  const assignmentCols = listAssignmentColumns(headers, mapping);
  const interventionCol = findInterventionColumn(headers, mapping);
  const slotsPerStudent = assignmentCols.length || 0;

  const totals = {
    assignmentsSubmitted: 0,
    assignmentsReviewed: 0,
    assignmentsAccepted: 0,
    assignmentsPending: 0,
    assignmentSlots: 0,
  };

  const groupMap = new Map<string, WeeklyInterventionStats>();

  const ensureGroup = (group: string): WeeklyInterventionStats => {
    const key = group.trim() || 'Unspecified';
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        group: key,
        studentCount: 0,
        assignmentsSubmitted: 0,
        assignmentsReviewed: 0,
        assignmentsAccepted: 0,
        assignmentsPending: 0,
      });
    }
    return groupMap.get(key)!;
  };

  for (const row of rows) {
    const group = interventionCol ? (row[interventionCol] ?? '').trim() || 'Unspecified' : 'All students';
    const g = ensureGroup(group);
    g.studentCount += 1;

    if (!slotsPerStudent) continue;

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

  return {
    ...totals,
    interventionBreakdown: Array.from(groupMap.values()).sort((a, b) => b.studentCount - a.studentCount),
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
