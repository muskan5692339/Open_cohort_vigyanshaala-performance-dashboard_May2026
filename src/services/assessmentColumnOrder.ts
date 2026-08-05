import { isAssignmentCommentColumn } from './studentAssignmentDisplay';

/** Extract quiz/assignment index from headers like "Quiz 3 Score" or "Assignment2_SWOT". */
export function extractAssessmentNumber(col: string): number | null {
  const m =
    col.match(/quiz\s*(\d+)/i)
    ?? col.match(/assignment\s*(\d+)/i)
    ?? col.match(/assignment(\d+)/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

function isFinalScoreHeader(col: string): boolean {
  const l = col.toLowerCase();
  return l.includes('final score') || l.includes('final selection') || l.includes('final assessment');
}

/** Quiz score columns — e.g. "Quiz 1 Score" … "Quiz 7 Score". */
export function isQuizScoreColumn(col: string): boolean {
  if (isFinalScoreHeader(col)) return false;
  const compact = col.toLowerCase().replace(/\s+/g, '');
  return /quiz\d+score/i.test(compact) || /quiz\d+/.test(compact) && col.toLowerCase().includes('score');
}

export function isQuizLikeColumn(col: string): boolean {
  if (isFinalScoreHeader(col)) return false;
  const l = col.toLowerCase();
  return l.includes('quiz') || l.includes('assessment') || l.includes('mcq') || /_quiz_/i.test(col);
}

/** Numbered assignment status columns — excludes *_comments / Comments_* columns. */
export function isNumberedAssignmentColumn(col: string): boolean {
  if (isAssignmentCommentColumn(col)) return false;
  const l = col.toLowerCase().replace(/\s+/g, '');
  return /assignment\d+/i.test(l) || /assignment\s*\d+/i.test(col);
}

export function dedupePreserveOrder(cols: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const col of cols) {
    if (!col || seen.has(col)) continue;
    seen.add(col);
    out.push(col);
  }
  return out;
}

/** Sort quiz/assignment columns by embedded number, then original sheet order. */
export function sortAssessmentColumns(cols: string[], headerOrder: string[] = cols): string[] {
  const orderIndex = new Map(headerOrder.map((h, i) => [h, i]));
  return [...cols].sort((a, b) => {
    const na = extractAssessmentNumber(a);
    const nb = extractAssessmentNumber(b);
    if (na != null && nb != null && na !== nb) return na - nb;
    if (na != null && nb == null) return -1;
    if (na == null && nb != null) return 1;
    return (orderIndex.get(a) ?? 9999) - (orderIndex.get(b) ?? 9999);
  });
}

export function discoverQuizScoreHeaders(headers: string[]): string[] {
  const scoreCols = headers.filter(isQuizScoreColumn);
  if (scoreCols.length) return sortAssessmentColumns(scoreCols, headers);

  const quizLike = headers.filter(c => isQuizLikeColumn(c) && !isAssignmentCommentColumn(c));
  return sortAssessmentColumns(quizLike, headers);
}

export function discoverNumberedAssignmentHeaders(headers: string[]): string[] {
  const numbered = headers.filter(isNumberedAssignmentColumn);
  return sortAssessmentColumns(numbered, headers);
}

export function mergeAssessmentColumns(
  sources: string[][],
  headerOrder: string[],
): string[] {
  return sortAssessmentColumns(dedupePreserveOrder(sources.flat()), headerOrder);
}

export function formatQuizLabel(col: string): string {
  const n = extractAssessmentNumber(col);
  if (n != null && /quiz/i.test(col)) return `Quiz ${n}`;
  return col.replace(/_/g, ' ').trim() || 'Quiz';
}

export function formatAssignmentLabel(col: string): string {
  const m =
    col.match(/assignment\s*(\d+)[\s_.-]*(.*)/i)
    ?? col.match(/assignment(\d+)[\s_.-]*(.*)/i);
  if (m) {
    const title = m[2].replace(/_/g, ' ').trim();
    return title ? `Assignment ${m[1]}: ${title}` : `Assignment ${m[1]}`;
  }
  return col.replace(/_/g, ' ').trim();
}
