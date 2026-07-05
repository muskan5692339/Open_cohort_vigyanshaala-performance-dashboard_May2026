import { normalizeExcelCell } from './excelCellValue';

export type AssignmentDisplayKind = 'accepted' | 'rejected' | 'pending' | 'other';

export interface StudentAssignmentItem {
  name: string;
  date: string;
  status: string;
  feedback: string;
  kind: AssignmentDisplayKind;
}

function stringifyCellValue(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string' && v.trim().startsWith('{"formula"')) {
    return normalizeExcelCell(JSON.parse(v) as unknown);
  }
  return normalizeExcelCell(v);
}

export function isAssignmentCommentColumn(col: string): boolean {
  const l = col.toLowerCase().replace(/^\uFEFF/, '').trim();
  return /(comments?|feedback|remarks?|notes?|facilitator\s*response)/i.test(l);
}

export function normalizeAssignmentKey(col: string): string {
  return col
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .replace(/[\s_-]*(comments?|feedback|remarks?|notes?)\s*$/i, '')
    .replace(/[^a-z0-9]/g, '');
}

export function findCommentColumnForAssignment(assignmentCol: string, columns: string[]): string | null {
  const base = normalizeAssignmentKey(assignmentCol);
  for (const col of columns) {
    if (!isAssignmentCommentColumn(col)) continue;
    const commentBase = normalizeAssignmentKey(col);
    if (commentBase === base || commentBase.startsWith(base) || base.startsWith(commentBase)) {
      return col;
    }
  }
  return null;
}

export function classifyAssignmentStatus(value: string): AssignmentDisplayKind {
  const s = value.toLowerCase().trim();
  if (!s) return 'pending';
  // Long cell text is facilitator feedback, not a status (may contain the word "accepted").
  if (s.length > 56) return 'other';
  if (s.includes('rejected')) return 'rejected';
  if (['accepted', 'submitted', 'complete', 'completed', 'pass'].some(k => s.includes(k))) {
    return 'accepted';
  }
  if (['no submission', 'not submission', 'pending', 'in progress', 'awaiting'].some(k => s.includes(k))) {
    return 'pending';
  }
  return 'other';
}

export function isLongFeedbackText(value: string): boolean {
  return value.trim().length > 56;
}

export function isAssignmentAccepted(value: string): boolean {
  return classifyAssignmentStatus(value) === 'accepted';
}

export function listAssignmentStatusColumns(cols: string[], allRowCols: string[] = cols): string[] {
  const exclude = new Set<string>();
  for (const col of allRowCols) {
    if (isAssignmentCommentColumn(col)) exclude.add(col);
  }
  for (const col of cols) {
    if (isAssignmentCommentColumn(col)) continue;
    const commentCol = findCommentColumnForAssignment(col, allRowCols);
    if (commentCol) exclude.add(commentCol);
  }
  return cols.filter(col => !exclude.has(col) && !isAssignmentCommentColumn(col));
}

export function resolveAssignmentDisplayFields(item: StudentAssignmentItem): {
  statusLabel: string;
  feedbackText: string;
  kind: AssignmentDisplayKind;
} {
  const nameLooksLikeComment = isAssignmentCommentColumn(item.name);
  const statusIsFeedback = isLongFeedbackText(item.status);

  if (nameLooksLikeComment || (statusIsFeedback && !item.feedback)) {
    return {
      statusLabel: 'Feedback',
      feedbackText: item.feedback || item.status,
      kind: 'other',
    };
  }

  if (statusIsFeedback && item.feedback) {
    return {
      statusLabel: item.status.slice(0, 48),
      feedbackText: item.feedback,
      kind: item.kind,
    };
  }

  return {
    statusLabel: item.status,
    feedbackText: item.feedback,
    kind: item.kind,
  };
}

export function getAssignmentStatusExplanation(
  kind: AssignmentDisplayKind,
  hasFeedback: boolean,
): string | null {
  if (kind === 'accepted' && hasFeedback) {
    return 'Accepted with feedback — your work was approved. The notes below are for your learning; you do not need to re-submit.';
  }
  if (kind === 'accepted') {
    return 'Accepted — your assignment was approved. Great work!';
  }
  if (kind === 'rejected') {
    return 'Rejected with feedback — your assignment needs changes before it can be accepted. Follow the steps below, then re-submit on the She for STEM portal.';
  }
  if (kind === 'pending') {
    return 'No submission yet — please complete and submit this assignment on the She for STEM portal.';
  }
  return null;
}

export const REJECTED_ASSIGNMENT_STEPS = [
  'Open the She for STEM learning portal and locate this assignment.',
  'Read every point in the facilitator feedback below.',
  'Update your work to fix each issue mentioned.',
  'Re-submit the assignment for review.',
  'Check this dashboard after the next sync (Monday, Wednesday, or Saturday) for your updated status.',
] as const;

export function buildStudentAssignmentItems(
  matched: Record<string, unknown>,
  assignmentCols: string[],
  allRowCols: string[],
): StudentAssignmentItem[] {
  const statusCols = listAssignmentStatusColumns(assignmentCols, allRowCols);
  return statusCols.slice(0, 12).map(col => {
    const status = stringifyCellValue(matched[col]) || 'Pending';
    const commentCol = findCommentColumnForAssignment(col, allRowCols);
    const feedback = commentCol ? stringifyCellValue(matched[commentCol]) : '';
    return {
      name: col.replace(/_/g, ' ').trim(),
      date: '—',
      status,
      feedback,
      kind: classifyAssignmentStatus(status),
    };
  });
}
